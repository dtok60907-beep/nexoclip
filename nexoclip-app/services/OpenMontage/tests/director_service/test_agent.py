"""Director agent over HTTP with a scripted fake LLM and a fake nexoclip bridge (no network, no cost).

Needs a Postgres to run against: DIRECTOR_TEST_DATABASE_URL (each test gets its own schema).
"""

from __future__ import annotations

import json
import os
import time
import uuid

import psycopg
import pytest
from fastapi.testclient import TestClient

from director_service import app as app_mod
from director_service import agent as agent_mod
from director_service import billing, db, generation, llm, nexoclip
from director_service.board import read_board
from director_service.store import read_director, update_director

TEST_DB_ENV = "DIRECTOR_TEST_DATABASE_URL"

OWNER = "11111111-2222-4333-8444-555555555555"
HEADERS = {"X-Nexoclip-User-Id": OWNER}

MAYA = {"id": "maya", "kind": "character", "name": "Maya",
        "description": "Maya, 18, Indonesian, medium-brown skin, long dark hair in a messy bun, yellow sundress"}
HOUSE = {"id": "beach_house", "kind": "location", "name": "Beach house",
         "description": "Weathered teal beach house on stilts, golden hour, warm light, sea behind"}
SHOTS = [
    {"id": "s1", "title": "Arrival", "description": "Maya arrives at the house", "duration_seconds": 6,
     "element_ids": ["maya", "beach_house"], "frame_prompt": "Maya stands before the teal beach house at golden hour",
     "video_prompt": "Maya walks toward the house, slow push in, waves"},
    {"id": "s2", "title": "Porch", "description": "Maya on the porch", "duration_seconds": 4,
     "element_ids": ["maya"], "frame_prompt": "Maya sits on the porch steps smiling",
     "video_prompt": "Maya laughs, hair moving in the breeze, handheld"},
]


def call(tool, **args):
    return {"name": tool, "args": args}


class FakeLLM:
    """llm.respond replacement. Each queued turn is a list of steps; a step is {"calls": [...], "text": str}."""

    def __init__(self) -> None:
        self.turns: list[list[dict]] = []
        self.requests: list[dict] = []
        self.research_calls: list[list[dict]] = []
        self._steps: list[dict] = []

    def respond(self, input_items, *, instructions, tools, previous_response_id=None, max_tokens=8000, on_text=None):
        self.requests.append({"input": input_items, "instructions": instructions, "previous": previous_response_id})
        if previous_response_id is None:
            self._steps = list(self.turns.pop(0)) if self.turns else [{"text": "Oke."}]
        step = self._steps.pop(0) if self._steps else {"text": "Selesai."}
        if on_text and step.get("text"):
            words = step["text"].split(" ")
            for n in range(1, len(words) + 1):  # streamed word by word, like the real API
                on_text(" ".join(words[:n]))
        calls = [{"call_id": f"call_{len(self.requests)}_{i}", "name": c["name"], "arguments": json.dumps(c["args"])}
                 for i, c in enumerate(step.get("calls", []))]
        return {"id": f"resp_{len(self.requests)}", "text": step.get("text", ""), "calls": calls,
                "usage": {"cost": 0.001, "input_tokens": 100, "output_tokens": 50}}

    def chat(self, messages, *, web_search=False, max_tokens=16000):
        self.research_calls.append(messages)
        return "Golden-hour beach trailers lean on warm grading.", {"cost": 0.03, "cited_urls": ["https://example.com/a", "https://example.com/a"]}


class FakeBridge:
    def __init__(self) -> None:
        self.user_id = OWNER
        self.credits = 100.0
        self.submits: list[dict] = []
        self.charges: list[dict] = []
        self.fail_once: set[str] = set()
        self.imports: list[dict] = []
        self.files: dict[str, nexoclip.Downloaded] = {}  # real media for render tests
        self._gens: dict[str, dict] = {}

    def balance(self):
        return self.credits

    def estimate(self, *, kind, prompt, parameters):
        if kind == "audio":
            return {"credits": 2.0, "usd": 0.02}
        credits = 1.0 if kind == "image" else 5.0 * parameters["duration"]
        return {"credits": credits, "usd": credits / 100}

    def charge_text(self, **kwargs):
        self.charges.append(kwargs)
        return 0.01

    def submit(self, *, kind, prompt, parameters, idempotency_key):
        gen_id = f"gen{len(self.submits) + 1}"
        key = idempotency_key.split(":")[1] + ":" + idempotency_key.split(":")[2]
        self.submits.append({"id": gen_id, "key": key, "kind": kind, "prompt": prompt, "parameters": parameters,
                             "idempotency_key": idempotency_key})
        failed = key in self.fail_once
        self.fail_once.discard(key)
        self._gens[gen_id] = {"id": gen_id, "status": "failed" if failed else "succeeded",
                              "error": {"message": "moderation"} if failed else None,
                              "outputs": [] if failed else [{"assetId": f"asset-{gen_id}", "contentType": "image/png" if kind == "image" else "video/mp4"}]}
        return {"id": gen_id, "status": "queued"}

    def generate_audio(self, *, text, parameters, idempotency_key):
        self.audio = getattr(self, "audio", []) + [{"text": text, "parameters": parameters, "idempotency_key": idempotency_key}]
        return {"asset_id": f"audio-{len(self.audio)}", "credits": 2.0}

    def status(self, generation_id):
        return self._gens[generation_id]

    def analyze_video(self, *, asset_id, question="", idempotency_key):
        self.watched = getattr(self, "watched", []) + [{"asset_id": asset_id, "question": question, "key": idempotency_key}]
        return {"text": f"00:00-00:03 a woman walks along the beach, handheld, golden hour ({question or 'overview'})", "credits": 0.2}

    def upload_render(self, *, content, filename):
        self.imports.append({"content": content, "content_type": "video/mp4", "filename": filename})
        return f"asset-import{len(self.imports)}"

    def download(self, asset_id):
        if asset_id in self.files:
            return self.files[asset_id]
        content_type = "video/mp4" if any(s["kind"] == "video" and f"asset-{s['id']}" == asset_id for s in self.submits) else "image/png"
        return nexoclip.Downloaded(content=f"media:{asset_id}".encode(), content_type=content_type)


@pytest.fixture
def fake_llm(monkeypatch):
    fake = FakeLLM()
    monkeypatch.setattr(llm, "respond", fake.respond)
    monkeypatch.setattr(llm, "chat", fake.chat)
    return fake


@pytest.fixture
def bridge(monkeypatch):
    fake = FakeBridge()
    monkeypatch.setattr(billing, "bridge_for", lambda project_id: fake if read_director(project_id)["owner"] == OWNER else None)
    monkeypatch.setattr(generation, "POLL_SECONDS", 0.0)
    return fake


@pytest.fixture(autouse=True)
def no_skill_gate(monkeypatch):
    """Most scripted turns skip read_skill; tests about the gate opt back in with skill_gate."""
    original = dict(agent_mod.REQUIRED_SKILLS)
    monkeypatch.setattr(agent_mod, "REQUIRED_SKILLS", {})
    return original


@pytest.fixture
def skill_gate(monkeypatch, no_skill_gate):
    monkeypatch.setattr(agent_mod, "REQUIRED_SKILLS", no_skill_gate)


@pytest.fixture
def database(monkeypatch):
    url = os.environ.get(TEST_DB_ENV)
    if not url:
        pytest.skip(f"set {TEST_DB_ENV} to a throwaway Postgres to run the director tests")
    schema = f"test_{uuid.uuid4().hex[:12]}"
    monkeypatch.setenv(db.URL_ENV, url)
    monkeypatch.setenv(db.SCHEMA_ENV, schema)
    db.close()
    yield
    db.close()
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')


@pytest.fixture
def client(database, fake_llm, bridge):
    with TestClient(app_mod.app) as c:
        yield c


def _wait(pid: str, timeout: float = 10.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        director = read_director(pid)
        if all((director.get(a) or {}).get("status") != "running" for a in ("agent", "generation", "render")):
            return director
        time.sleep(0.02)
    raise AssertionError("project stayed busy")


def _view(client, pid, headers=HEADERS):
    return client.get(f"/api/director/projects/{pid}", headers=headers).json()


def _say(client, pid, text):
    res = client.post(f"/api/director/projects/{pid}/messages", json={"text": text}, headers=HEADERS)
    assert res.status_code == 200, res.text
    _wait(pid)
    return _view(client, pid)


BUILD_TURN = [
    {"calls": [call("update_brief", summary="Trailer rom-com 30 detik", look="realistic", aspect_ratio="16:9", duration_seconds=30, style="warm film grain"),
               call("upsert_element", **MAYA), call("upsert_element", **HOUSE),
               call("write_script", title="Shore Thing", text="Maya tiba di rumah pantai...")]},
    {"calls": [call("read_skill", name="seedance-prompting"), call("set_shots", shots=SHOTS)]},
    {"text": "Brief, 2 elemen, naskah dan 2 shot sudah siap. Mau cek wajah Maya dulu?"},
]


def _built_project(client, fake_llm) -> str:
    fake_llm.turns.append(BUILD_TURN)
    pid = client.post("/api/director/projects", json={"brief": "bikin trailer rom-com 30 detik"}, headers=HEADERS).json()["project_id"]
    _wait(pid)
    return pid


def test_greeting_only_talks(client, fake_llm, bridge):
    fake_llm.turns.append([{"text": "Halo! Mau bikin video apa?"}])
    pid = client.post("/api/director/projects", json={"brief": "hai"}, headers=HEADERS).json()["project_id"]
    _wait(pid)
    view = _view(client, pid)
    assert [(c["role"], c["text"]) for c in view["chat"]] == [("user", "hai"), ("assistant", "Halo! Mau bikin video apa?")]
    assert view["board"]["shots"] == [] and view["board"]["requests"] == []
    assert fake_llm.requests[0]["input"] == [{"role": "user", "content": "hai"}]
    assert len(bridge.charges) == 1 and bridge.submits == []


def test_agent_builds_the_board_with_tools(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    view = _view(client, pid)
    board = view["board"]
    assert board["brief"]["aspect_ratio"] == "16:9" and board["brief"]["style"] == "warm film grain"
    assert [e["id"] for e in board["elements"]] == ["maya", "beach_house"]
    assert [s["id"] for s in board["shots"]] == ["s1", "s2"]
    assert board["script"]["title"] == "Shore Thing"
    assert view["title"] == "Shore Thing"
    kinds = [c["kind"] for c in view["chat"]]
    # ... then the new asset sheets are generated automatically, no approval card.
    assert kinds == ["message"] + ["activity"] * 6 + ["card"] * 4 + ["message", "request", "generation"]
    # One card per artifact the turn changed, shown before the reply.
    assert [c["meta"]["card"] for c in view["chat"] if c["kind"] == "card"] == ["brief", "script", "assets", "shots"]
    assert view["chat"][2]["text"] == "Menambah karakter: Maya"
    # Media are derived from the board: element sheets, shot frames and videos.
    assert board["media"]["frame:s1"]["status"] == "none"
    assert "Style: warm film grain" in board["media"]["element:maya"]["prompt"]
    # Tool results go back to the model in the same turn, chained by previous_response_id.
    second = fake_llm.requests[1]
    assert second["previous"] == "resp_1" and all(i["type"] == "function_call_output" for i in second["input"])
    # The instructions (and the board in them) stay as they were when the turn began, so the prompt cache holds.
    assert second["instructions"] == fake_llm.requests[0]["instructions"]
    assert "PROJECT BOARD (JSON) as it was when this turn began" in second["instructions"] and '"maya"' not in second["instructions"]
    assert [x["key"] for x in bridge.submits] == ["element:maya", "element:beach_house"]


def test_tool_errors_are_returned_to_the_model(client, fake_llm, skill_gate):
    fake_llm.turns.append([
        {"calls": [call("read_skill", name="idea-director"), call("update_brief", summary="Trailer", look="realistic"),
                   call("set_shots", shots=SHOTS)]},  # no prompt guide read yet
        {"calls": [call("read_skill", name="seedance-prompting"), call("set_shots", shots=SHOTS)]},  # elements missing
        {"calls": [call("read_skill", name="image-gen-usage"), call("upsert_element", **MAYA), call("upsert_element", **HOUSE)]},
        {"calls": [call("set_shots", shots=SHOTS)]},
        {"text": "Sudah."},
    ])
    pid = client.post("/api/director/projects", json={"brief": "trailer"}, headers=HEADERS).json()["project_id"]
    _wait(pid)
    refused = json.loads(fake_llm.requests[1]["input"][2]["output"])
    assert refused["ok"] is False and "needs the seedance-basics, seedance-prompting, scene-director guide" in refused["error"]
    assert "Seedance 2.5 — production reference (ByteDance" in refused["skill_content"]["seedance-prompting"]
    assert "# Dramaturgy, detail, montage" in refused["skill_content"]["scene-director"]  # no type yet: a story film
    error = json.loads(fake_llm.requests[2]["input"][1]["output"])
    assert error["ok"] is False and "unknown element_ids" in error["error"]
    assert [s["id"] for s in read_board(pid)["shots"]] == ["s1", "s2"]


def test_research_is_saved_with_sources(client, fake_llm, bridge):
    fake_llm.turns.append([{"calls": [call("web_research", query="rom-com trailer pacing")]}, {"text": "Ini temuanku."}])
    pid = client.post("/api/director/projects", json={"brief": "riset dulu"}, headers=HEADERS).json()["project_id"]
    _wait(pid)
    research = read_board(pid)["research"]
    assert research[0]["query"] == "rom-com trailer pacing" and research[0]["sources"] == ["https://example.com/a"]
    assert read_director(pid)["llm_cost_usd"] == pytest.approx(0.002 + 0.03)
    assert len(bridge.charges) == 3  # two agent steps + the search


def test_llm_failure_is_shown_and_retry_answers_again(client, fake_llm, monkeypatch):
    def broken(*args, **kwargs):
        raise llm.LLMError("OpenAI returned 500")

    monkeypatch.setattr(llm, "respond", broken)
    pid = client.post("/api/director/projects", json={"brief": "hai"}, headers=HEADERS).json()["project_id"]
    director = _wait(pid)
    assert director["agent"]["status"] == "error"
    assert _view(client, pid)["chat"][-1]["text"].startswith("Director gagal membalas")

    monkeypatch.setattr(llm, "respond", fake_llm.respond)
    fake_llm.turns.append([{"text": "Halo lagi!"}])
    assert client.post(f"/api/director/projects/{pid}/retry", headers=HEADERS).status_code == 200
    _wait(pid)
    assert _view(client, pid)["chat"][-1]["text"] == "Halo lagi!"


def test_empty_balance_blocks_the_turn(client, fake_llm, bridge):
    bridge.credits = 0
    pid = client.post("/api/director/projects", json={"brief": "hai"}, headers=HEADERS).json()["project_id"]
    _wait(pid)
    assert "Kredit nexoclip tidak cukup" in _view(client, pid)["chat"][-1]["text"]
    assert fake_llm.requests == []


def test_projects_are_scoped_to_their_owner(client, fake_llm):
    pid = client.post("/api/director/projects", json={"brief": "hai"}, headers=HEADERS).json()["project_id"]
    _wait(pid)
    other = {"X-Nexoclip-User-Id": "bob"}
    assert client.get(f"/api/director/projects/{pid}", headers=other).status_code == 404
    assert client.post(f"/api/director/projects/{pid}/messages", json={"text": "x"}, headers=other).status_code == 404
    assert [p["project_id"] for p in client.get("/api/director/projects", headers=HEADERS).json()] == [pid]
    assert client.get("/api/director/projects", headers=other).json() == []


def test_proxy_secret_is_required_when_configured(client, monkeypatch):
    monkeypatch.setenv("DIRECTOR_PROXY_SECRET", "s3cret")
    assert client.get("/api/director/projects").status_code == 403
    assert client.get("/api/director/projects", headers={"X-Director-Proxy-Secret": "wrong"}).status_code == 403
    assert client.get("/api/projects").status_code == 403
    assert client.get("/api/director/projects", headers={"X-Director-Proxy-Secret": "s3cret"}).status_code == 200
    assert client.get("/api/director/health").status_code == 200  # platform healthcheck


def test_skills_are_loaded_on_demand(client, fake_llm):
    fake_llm.turns.append([{"calls": [call("read_skill", name="seedance-prompting"), call("read_skill", name="nope")]},
                           {"text": "Siap."}])
    pid = client.post("/api/director/projects", json={"brief": "trailer"}, headers=HEADERS).json()["project_id"]
    _wait(pid)
    first = fake_llm.requests[0]["instructions"]
    assert "- seedance-prompting:" in first and "## 7. The anti-collapse skeleton" not in first
    outputs = [json.loads(i["output"]) for i in fake_llm.requests[1]["input"]]
    assert outputs[0]["ok"] and "## 7. The anti-collapse skeleton" in outputs[0]["content"]
    assert outputs[1]["ok"] is False and "unknown skill" in outputs[1]["error"]
    assert _view(client, pid)["chat"][1]["text"] == "Membaca skill: seedance-prompting"


def test_source_code_is_offered_under_agpl(client):
    import io
    import tarfile

    res = client.get("/api/director/source")
    assert res.status_code == 200 and "attachment" in res.headers["content-disposition"]
    names = tarfile.open(fileobj=io.BytesIO(res.content)).getnames()
    assert "nexoclip-director-source/LICENSE" in names
    assert "nexoclip-director-source/director_service/agent.py" in names
    assert "nexoclip-director-source/skills/creative/prompting/seedance-prompting.md" in names
    assert not any(n.endswith(".env") or "__pycache__" in n or "/projects/" in n for n in names)


def _edit(client, pid, tool, **args):
    return client.post(f"/api/director/projects/{pid}/edit", json={"tool": tool, "args": args}, headers=HEADERS)


def test_every_change_is_a_version_and_can_be_restored(client, fake_llm):
    pid = _built_project(client, fake_llm)
    versions = client.get(f"/api/director/projects/{pid}/versions", headers=HEADERS).json()
    assert [v["author"] for v in versions][-1] == "system" and versions[-1]["summary"] == "Project dibuat"
    assert {v["author"] for v in versions[:-1]} == {"agent"}
    before = read_board(pid)["version"]

    res = _edit(client, pid, "write_script", title="Shore Thing", text="Versi aku sendiri.")
    assert res.status_code == 200
    view = _view(client, pid)
    assert view["board"]["script"]["text"] == "Versi aku sendiri."
    assert view["board"]["version"] == before + 1
    assert view["chat"][-1]["kind"] == "edit" and view["chat"][-1]["role"] == "user"
    latest = client.get(f"/api/director/projects/{pid}/versions", headers=HEADERS).json()[0]
    assert latest["author"] == "user" and latest["summary"] == "Menulis naskah"

    # The agent sees the user's edit in its history.
    fake_llm.turns.append([{"text": "Noted."}])
    _say(client, pid, "oke")
    assert {"role": "user", "content": "[user edited: Menulis naskah]"} in fake_llm.requests[-1]["input"]

    old = client.get(f"/api/director/projects/{pid}/versions/{before}", headers=HEADERS).json()
    assert old["script"]["text"] == "Maya tiba di rumah pantai..."
    res = client.post(f"/api/director/projects/{pid}/restore", json={"version": before}, headers=HEADERS)
    assert res.status_code == 200 and res.json()["version"] == before + 2
    assert _view(client, pid)["board"]["script"]["text"] == "Maya tiba di rumah pantai..."
    assert client.post(f"/api/director/projects/{pid}/restore", json={"version": 999}, headers=HEADERS).status_code == 400


def test_runtime_changes_do_not_create_versions(client, fake_llm):
    pid = _built_project(client, fake_llm)
    fake_llm.turns.append([{"calls": [call("request_generation", items=["element:maya"])]}, {"text": "ok"}])
    before = read_board(pid)["version"]
    _say(client, pid, "cek maya")
    assert read_board(pid)["version"] == before


def test_user_edits_are_validated(client, fake_llm):
    pid = _built_project(client, fake_llm)
    assert _edit(client, pid, "update_shot", id="s1", duration_seconds=99).status_code == 400
    assert _edit(client, pid, "set_shots", shots=[]).status_code == 400  # not a user edit
    assert _edit(client, pid, "update_shot", id="nope", title="x").status_code == 400
    assert _edit(client, pid, "update_shot", id="s1", title="Kedatangan").status_code == 200
    assert read_board(pid)["shots"][0]["title"] == "Kedatangan"


def test_agent_cannot_change_locked_items(client, fake_llm):
    pid = _built_project(client, fake_llm)
    assert _edit(client, pid, "set_lock", target="shot:s1", locked=True).status_code == 200
    assert _edit(client, pid, "set_lock", target="element:maya", locked=True).status_code == 200
    changed = [{**SHOTS[0], "title": "Changed"}, SHOTS[1]]
    fake_llm.turns.append([
        {"calls": [call("read_skill", name="seedance-prompting"),
                   call("update_shot", id="s1", video_prompt="new"),
                   call("set_shots", shots=changed),
                   call("remove_shot", id="s1"),
                   call("upsert_element", **{**MAYA, "description": MAYA["description"] + ", glasses"}),
                   call("update_shot", id="s2", title="Teras")]},
        {"text": "ok"},
    ])
    _say(client, pid, "ubah semuanya")
    outputs = [json.loads(i["output"]) for i in fake_llm.requests[-1]["input"]]
    assert [o["ok"] for o in outputs] == [True, False, False, False, False, True]
    assert all("locked by the user" in o["error"] for o in outputs[1:5])
    board = read_board(pid)
    assert board["shots"][0]["title"] == "Arrival" and board["shots"][0]["locked"] is True
    assert board["shots"][1]["title"] == "Teras"
    # Replacing the list while keeping the locked shot identical is fine.
    fake_llm.turns.append([{"calls": [call("read_skill", name="seedance-prompting"),
                                      call("set_shots", shots=[SHOTS[0], {**SHOTS[1], "title": "Porch 2"}])]}, {"text": "ok"}])
    _say(client, pid, "rapikan")
    assert json.loads(fake_llm.requests[-1]["input"][1]["output"])["ok"] is True
    assert read_board(pid)["shots"][0]["locked"] is True
    # The user can still change what they locked.
    assert _edit(client, pid, "update_shot", id="s1", title="Tiba").status_code == 200


def test_concepts(client, fake_llm):
    options = [{"id": "warm", "title": "Hangat", "logline": "Liburan terakhir yang hangat", "approach": "golden hour", "why": "nostalgia"},
               {"id": "chaos", "title": "Kacau", "logline": "Liburan yang berantakan", "approach": "handheld", "why": "komedi"}]
    fake_llm.turns.append([{"calls": [call("update_brief", summary="Trailer rom-com"),
                                      call("set_concepts", options=options, recommended="warm")]}, {"text": "Aku rekomendasi Hangat."}])
    pid = client.post("/api/director/projects", json={"brief": "trailer rom-com"}, headers=HEADERS).json()["project_id"]
    _wait(pid)
    concepts = _view(client, pid)["board"]["concepts"]
    assert [o["id"] for o in concepts["options"]] == ["warm", "chaos"] and concepts["recommended"] == "warm"
    assert _edit(client, pid, "choose_concept", id="chaos").status_code == 200
    assert read_board(pid)["concepts"]["chosen"] == "chaos"
    fake_llm.turns.append([{"calls": [call("set_concepts", options=options, recommended="dull")]}, {"text": "ok"}])
    _say(client, pid, "ganti")
    assert "recommended must be" in json.loads(fake_llm.requests[-1]["input"][0]["output"])["error"]


def test_stale_running_status_is_healed(client, fake_llm):
    fake_llm.turns.append([{"text": "Halo!"}])
    pid = client.post("/api/director/projects", json={"brief": "hai"}, headers=HEADERS).json()["project_id"]
    _wait(pid)
    update_director(pid, agent={"status": "running", "error": None})  # as if the instance died mid-turn
    view = _view(client, pid)
    assert view["agent"]["status"] == "error" and "terputus" in view["agent"]["error"]


def test_activity_lock_is_shared_across_instances(client, fake_llm):
    fake_llm.turns.append([{"text": "Halo!"}])
    pid = client.post("/api/director/projects", json={"brief": "hai"}, headers=HEADERS).json()["project_id"]
    _wait(pid)
    other_instance = db.ActivityLock(pid, "agent")
    assert other_instance.try_acquire()
    try:
        res = client.post(f"/api/director/projects/{pid}/messages", json={"text": "halo"}, headers=HEADERS)
        assert res.status_code == 409
        assert _edit(client, pid, "update_brief", style="noir").status_code == 409
    finally:
        other_instance.release()
    assert _edit(client, pid, "update_brief", style="noir").status_code == 200


def test_changes_reach_the_event_stream(client, fake_llm):
    fake_llm.turns.append([{"text": "Halo!"}])
    pid = client.post("/api/director/projects", json={"brief": "hai"}, headers=HEADERS).json()["project_id"]
    _wait(pid)
    seen = []
    app_mod.hub._publish_orig = app_mod.hub._publish

    def spy(project_id):
        seen.append(project_id)
        app_mod.hub._publish_orig(project_id)

    app_mod.hub._publish = spy
    try:
        _edit(client, pid, "update_brief", style="noir")
        deadline = time.time() + 5
        while pid not in seen and time.time() < deadline:
            time.sleep(0.05)
    finally:
        app_mod.hub._publish = app_mod.hub._publish_orig
    assert pid in seen  # NOTIFY from the write came back through LISTEN


def test_creative_tools_require_their_openmontage_skill(client, fake_llm, skill_gate):
    fake_llm.turns.append([
        {"calls": [call("update_brief", summary="Trailer"), call("write_script", title="T", text="x"),
                   call("upsert_element", **MAYA), call("set_concepts", options=[], recommended="a"),
                   call("update_brief", aspect_ratio="9:16")]},
        {"calls": [call("read_skill", name="idea-director"), call("read_skill", name="script-director"),
                   call("read_skill", name="image-gen-usage")]},
        {"calls": [call("update_brief", summary="Trailer", look="realistic"), call("write_script", title="T", text="x"), call("upsert_element", **MAYA)]},
        {"text": "ok"},
    ])
    pid = client.post("/api/director/projects", json={"brief": "trailer"}, headers=HEADERS).json()["project_id"]
    _wait(pid)
    first = [json.loads(i["output"]) for i in fake_llm.requests[1]["input"]]
    assert [o["ok"] for o in first] == [False, False, False, False, True]  # a plain format change needs no skill
    assert "idea-director" in first[0]["error"]
    # idea-director was loaded by the first refusal, so set_concepts passes the skill gate and is held back only
    # because the brief (refused above) is still empty.
    assert "brief is empty" in first[3]["error"]
    # The refused calls come back with the guide loaded, so a retry in the same turn goes through.
    assert set(first[0]["skill_content"]) == {"idea-director"}
    third = [json.loads(i["output"]) for i in fake_llm.requests[3]["input"]]
    assert all(o["ok"] for o in third)


def test_scenes_group_shots(client, fake_llm):
    pid = _built_project(client, fake_llm)
    scenes = [{"id": "arrive", "title": "Tiba", "description": "Rumah pantai, sore"},
              {"id": "porch", "title": "Teras", "description": "Teras, golden hour"}]
    shots = [{**SHOTS[0], "scene_id": "arrive"}, {**SHOTS[1], "scene_id": "porch"}]
    fake_llm.turns.append([{"calls": [call("set_scenes", scenes=scenes), call("set_shots", shots=SHOTS)]},
                           {"calls": [call("set_shots", shots=shots)]}, {"text": "ok"}])
    view = _say(client, pid, "bagi jadi scene")
    missing_scene = json.loads(fake_llm.requests[-2]["input"][1]["output"])
    assert missing_scene["ok"] is False and "scene_id must be one of" in missing_scene["error"]
    assert [s["scene_id"] for s in view["board"]["shots"]] == ["arrive", "porch"]
    assert [s["id"] for s in view["board"]["scenes"]] == ["arrive", "porch"]
    fake_llm.turns.append([{"calls": [call("set_scenes", scenes=scenes[:1])]}, {"text": "ok"}])
    _say(client, pid, "hapus scene teras")
    assert "still use removed scenes" in json.loads(fake_llm.requests[-1]["input"][0]["output"])["error"]


def test_refused_calls_must_be_redone_before_the_reply(client, fake_llm, monkeypatch, no_skill_gate):
    pid = _built_project(client, fake_llm)
    monkeypatch.setattr(agent_mod, "REQUIRED_SKILLS", no_skill_gate)
    fake_llm.turns.append([
        {"calls": [call("update_shot", id="s1", video_prompt="new motion")]},  # held back: guide not read
        {"text": "Sudah aku ubah!"},  # claims success without redoing it
        {"calls": [call("update_shot", id="s1", video_prompt="new motion")]},
        {"text": "Sekarang sudah."},
    ])
    view = _say(client, pid, "ubah gerakan shot 1")
    nudge = fake_llm.requests[-2]["input"][0]
    assert nudge["role"] == "user" and "update_shot(s1)" in nudge["content"]
    assert read_board(pid)["shots"][0]["video_prompt"] == "new motion"
    texts = [c["text"] for c in view["chat"] if c["kind"] == "message" and c["role"] == "assistant"]
    assert "Sudah aku ubah!" not in texts and texts[-1] == "Sekarang sudah."


def test_asset_sheets_are_generated_without_approval(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    by_key = {x["key"]: x for x in bridge.submits}
    assert list(by_key) == ["element:maya", "element:beach_house"]
    assert by_key["element:maya"]["parameters"] == {"aspectRatio": "16:9"}
    assert by_key["element:maya"]["prompt"].startswith("Character reference sheet")
    assert by_key["element:beach_house"]["prompt"].startswith("Location reference sheet")
    view = _view(client, pid)
    auto = view["board"]["requests"][-1]
    assert auto["auto"] is True and auto["status"] == "done"
    assert view["chat"][-1]["text"] == "Generate selesai: 2 berhasil."
    # A turn that tweaks one element several times regenerates that sheet once, at the end of the turn.
    fake_llm.turns.append([{"calls": [call("upsert_element", **{**MAYA, "description": MAYA["description"] + ", freckles"}),
                                      call("upsert_element", **{**MAYA, "description": MAYA["description"] + ", freckles, glasses"})]},
                           {"text": "ok"}])
    _say(client, pid, "tambah freckles dan kacamata")
    assert [x["key"] for x in bridge.submits[2:]] == ["element:maya"]
    assert "glasses" in bridge.submits[-1]["prompt"]
    # Asking for a sheet explicitly is a no-op for the agent (it happens anyway) ...
    fake_llm.turns.append([{"calls": [call("request_generation", items=["element:maya"])]}, {"text": "ok"}])
    _say(client, pid, "generate maya")
    assert len(bridge.submits) == 3
    # ... and the user's "Generate sheet" button redoes it at once.
    res = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["element:maya"], "force": True}, headers=HEADERS)
    assert res.status_code == 200
    _wait(pid)
    assert [x["key"] for x in bridge.submits] == ["element:maya", "element:beach_house", "element:maya", "element:maya"]


def test_failed_sheet_is_retried_on_the_next_turn(client, fake_llm, bridge):
    bridge.fail_once = {"element:maya"}
    pid = _built_project(client, fake_llm)
    assert _view(client, pid)["chat"][-1]["text"] == "Generate selesai: 1 berhasil, 1 gagal (element:maya: moderation)."
    fake_llm.turns.append([{"text": "Halo"}])
    _say(client, pid, "lanjut")
    assert bridge.submits[-1]["key"] == "element:maya" and bridge.submits[-1]["idempotency_key"].endswith(":2")
    assert _view(client, pid)["board"]["media"]["element:maya"]["status"] == "succeeded"


def test_frames_and_videos_need_approval_and_use_the_sheets(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    fake_llm.turns.append([{"calls": [call("request_generation", items=["video:s1"], note="cek shot 1")]},
                           {"text": "Estimasinya sudah ada, tinggal approve."}])
    view = _say(client, pid, "langsung bikin video shot 1")
    request = view["board"]["requests"][-1]
    assert request["status"] == "pending" and not request["auto"]
    assert request["items"] == ["frame:s1", "video:s1"]  # the sheets already exist
    assert request["estimate"] == {"available": True, "images": 1, "videos": 1, "video_seconds": 6, "audio": 0, "credits": 31.0, "usd": 0.31}
    assert len(bridge.submits) == 2  # only the automatic sheets so far

    res = client.post(f"/api/director/projects/{pid}/requests/{request['id']}/approve", headers=HEADERS)
    assert res.status_code == 200, res.text
    _wait(pid)
    by_key = {x["key"]: x for x in bridge.submits}
    assert by_key["frame:s1"]["parameters"]["referenceImages"] == ["/api/assets/asset-gen1/download", "/api/assets/asset-gen2/download"]
    # The video gets its frame first, then the same sheets, and the prompt says which image is which.
    assert by_key["video:s1"]["parameters"] == {"aspectRatio": "16:9", "duration": 6, "resolution": "720p", "generateAudio": True,
                                                "referenceImages": ["/api/assets/asset-gen3/download",
                                                                    "/api/assets/asset-gen1/download", "/api/assets/asset-gen2/download"]}
    prompt = by_key["video:s1"]["prompt"]
    assert "@Image1 is the opening frame" in prompt
    assert "@Image2 is the reference sheet of Maya (character)" in prompt and "exact same person" in prompt
    assert "@Image3 is the reference sheet of" in prompt and "exact same location" in prompt
    view = _view(client, pid)
    assert view["board"]["requests"][-1]["status"] == "done"
    assert view["chat"][-1]["text"] == "Generate selesai: 2 berhasil."
    assert view["board"]["media"]["video:s1"]["asset_id"] == "asset-gen4"
    assert client.post(f"/api/director/projects/{pid}/requests/{request['id']}/approve", headers=HEADERS).status_code == 400


def test_edits_only_regenerate_what_changed(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    fake_llm.turns.append([{"calls": [call("request_generation", items=["video:s1", "video:s2"])]}, {"text": "ok"}])
    view = _say(client, pid, "generate semua")
    client.post(f"/api/director/projects/{pid}/requests/{view['board']['requests'][-1]['id']}/approve", headers=HEADERS)
    _wait(pid)
    assert len(bridge.submits) == 6

    fake_llm.turns.append([{"calls": [call("read_skill", name="seedance-prompting"),
                                      call("update_shot", id="s2", video_prompt="Maya trips on the steps, comedic, handheld")]},
                           {"calls": [call("request_generation", items=["video:s2"])]}, {"text": "ok"}])
    view = _say(client, pid, "shot 2 bikin dia kesandung")
    assert view["board"]["media"]["video:s2"]["stale"] is True
    assert view["board"]["media"]["frame:s2"]["stale"] is False
    assert view["board"]["requests"][-1]["items"] == ["video:s2"]

    fake_llm.turns.append([{"calls": [call("upsert_element", **{**HOUSE, "description": HOUSE["description"].replace("teal", "blue")})]},
                           {"calls": [call("request_generation", items=["video:s1"])]}, {"text": "ok"}])
    view = _say(client, pid, "rumahnya biru")
    # The house sheet regenerates by itself; it feeds shot 1 only, so shot 2 keeps its frame.
    assert bridge.submits[-1]["key"] == "element:beach_house"
    cart = [r for r in view["board"]["requests"] if not r.get("auto")]
    assert cart[-1]["items"] == ["frame:s1", "video:s1", "video:s2"]  # the unapproved video:s2 is kept
    assert [r["status"] for r in cart][-2:] == ["superseded", "pending"]
    assert view["board"]["media"]["frame:s2"]["stale"] is False


def test_a_request_goes_stale_if_prompts_change_before_approval(client, fake_llm):
    pid = _built_project(client, fake_llm)
    rid = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["frame:s1"]}, headers=HEADERS).json()["request_id"]
    assert _edit(client, pid, "update_shot", id="s1", frame_prompt="Maya at the door, backlit").status_code == 200
    res = client.post(f"/api/director/projects/{pid}/requests/{rid}/approve", headers=HEADERS)
    assert res.status_code == 400 and "berubah" in res.json()["detail"]


def test_reject_and_failed_job_retry(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    rid = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["frame:s1"]}, headers=HEADERS).json()["request_id"]
    assert client.post(f"/api/director/projects/{pid}/requests/{rid}/reject", headers=HEADERS).status_code == 200
    assert _view(client, pid)["board"]["requests"][-1]["status"] == "rejected"

    bridge.fail_once = {"frame:s1"}
    rid = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["frame:s1", "frame:s2"]}, headers=HEADERS).json()["request_id"]
    client.post(f"/api/director/projects/{pid}/requests/{rid}/approve", headers=HEADERS)
    _wait(pid)
    view = _view(client, pid)
    assert view["board"]["requests"][-1]["status"] == "failed"
    assert view["chat"][-1]["text"] == "Generate selesai: 1 berhasil, 1 gagal (frame:s1: moderation)."
    res = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["frame:s1"]}, headers=HEADERS)
    assert res.json()["items"] == ["frame:s1"]
    client.post(f"/api/director/projects/{pid}/requests/{res.json()['request_id']}/approve", headers=HEADERS)
    _wait(pid)
    assert bridge.submits[-1]["idempotency_key"].endswith(":2")
    assert _view(client, pid)["board"]["media"]["frame:s1"]["status"] == "succeeded"


def test_requests_in_one_turn_accumulate(client, fake_llm):
    pid = _built_project(client, fake_llm)
    fake_llm.turns.append([{"calls": [call("request_generation", items=["frame:s1"]),
                                      call("request_generation", items=["frame:s2"])]}, {"text": "ok"}])
    view = _say(client, pid, "bikin frame-nya")
    pending = [r for r in view["board"]["requests"] if r["status"] == "pending"]
    assert len(pending) == 1 and pending[0]["items"] == ["frame:s1", "frame:s2"]
    assert pending[0]["estimate"]["images"] == 2


def test_user_can_prepare_generation_from_the_board(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    res = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["frame:s2"]}, headers=HEADERS)
    assert res.status_code == 200, res.text
    assert res.json()["items"] == ["frame:s2"]
    view = _view(client, pid)
    assert view["chat"][-1]["kind"] == "request" and view["chat"][-1]["role"] == "user"
    assert len(bridge.submits) == 2  # just the automatic sheets
    assert client.post(f"/api/director/projects/{pid}/requests", json={"items": ["frame:nope"]}, headers=HEADERS).status_code == 400


# ---------------------------------------------------------------- final render


def _media(tmp_path, kind):
    from director_service import render

    out = tmp_path / ("clip.mp4" if kind == "video" else "frame.png")
    if kind == "video":  # 2 s, 320x240, no audio track (like a silent Seedance clip)
        render._run(["-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=24:duration=2", "-c:v", "libx264",
                     "-pix_fmt", "yuv420p", str(out)])
        return nexoclip.Downloaded(out.read_bytes(), "video/mp4")
    render._run(["-y", "-f", "lavfi", "-i", "color=c=teal:size=400x400", "-frames:v", "1", str(out)])
    return nexoclip.Downloaded(out.read_bytes(), "image/png")


def test_render_joins_videos_and_still_frames_into_one_mp4(client, fake_llm, bridge, tmp_path):
    from director_service import render

    pid = _built_project(client, fake_llm)
    assert client.post(f"/api/director/projects/{pid}/renders", headers=HEADERS).status_code == 400  # nothing to show yet
    request = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["video:s1", "frame:s2"]}, headers=HEADERS).json()
    client.post(f"/api/director/projects/{pid}/requests/{request['request_id']}/approve", headers=HEADERS)
    _wait(pid)
    media = _view(client, pid)["board"]["media"]
    bridge.files[media["video:s1"]["asset_id"]] = _media(tmp_path, "video")
    bridge.files[media["frame:s2"]["asset_id"]] = _media(tmp_path, "frame")

    res = client.post(f"/api/director/projects/{pid}/renders", headers=HEADERS)
    assert res.status_code == 201, res.text
    assert res.json()["shots"] == 2 and res.json()["stills"] == 1
    _wait(pid, timeout=120)
    view = _view(client, pid)
    item = view["board"]["renders"][-1]
    assert item["status"] == "done", item
    assert item["asset_id"] == "asset-import1" and item["progress"] == {"done": 2, "total": 2}
    assert (item["width"], item["height"]) == (1280, 720)
    assert abs(item["duration_seconds"] - 6.0) < 0.3  # 2 s clip + shot 2's frame held for its 4 s
    # Where each shot sits in the final video: the clip's real length, not the shot's planned 6 s.
    segments = [(s["shot_id"], s["source"], round(s["start"], 1), round(s["duration"], 1)) for s in item["segments"]]
    assert segments == [("s1", "video", 0.0, 2.0), ("s2", "frame", 2.0, 4.0)]
    assert view["chat"][-1]["kind"] == "render" and view["chat"][-1]["meta"]["render_id"] == item["id"]

    upload = bridge.imports[0]
    assert upload["content_type"] == "video/mp4" and upload["filename"] == "Shore Thing.mp4"
    out = tmp_path / "final.mp4"
    out.write_bytes(upload["content"])
    assert render.has_audio(str(out))  # silent clips still carry a track, so players and editors agree


def test_agent_can_render_and_a_dead_render_is_healed(client, fake_llm, bridge, tmp_path, monkeypatch):
    from director_service import render

    pid = _built_project(client, fake_llm)
    request = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["frame:s1"]}, headers=HEADERS).json()
    client.post(f"/api/director/projects/{pid}/requests/{request['request_id']}/approve", headers=HEADERS)
    _wait(pid)
    bridge.files[_view(client, pid)["board"]["media"]["frame:s1"]["asset_id"]] = _media(tmp_path, "frame")

    fake_llm.turns.append([{"calls": [call("render_video")]}, {"text": "Lagi dirender."}])
    view = _say(client, pid, "export videonya dong")
    _wait(pid, timeout=120)
    item = _view(client, pid)["board"]["renders"][-1]
    assert item["status"] == "done" and item["shots"] == ["s1"] and item["stills"] == 1 and item["skipped"] == 1

    # A render left "running" by a crashed instance is marked failed, so it can be started again.
    item = render.create(pid)
    render._set(pid, item["id"], status="running")
    assert _view(client, pid)["board"]["renders"][-1]["status"] == "failed"


def test_user_can_reorder_and_delete_shots_from_the_timeline(client, fake_llm):
    pid = _built_project(client, fake_llm)
    edit = lambda tool, **args: client.post(f"/api/director/projects/{pid}/edit", json={"tool": tool, "args": args}, headers=HEADERS)
    assert edit("set_scenes", scenes=[{"id": "datang", "title": "Datang", "description": "x"}, {"id": "teras", "title": "Teras", "description": "y"}]).status_code == 200
    assert edit("update_shot", id="s1", scene_id="datang").status_code == 200
    assert edit("update_shot", id="s2", scene_id="teras").status_code == 200

    # s2 dropped first lands among scene a's shots, so it joins scene a.
    assert edit("move_shot", id="s2", to_index=0).status_code == 200
    board = _view(client, pid)["board"]
    assert [s["id"] for s in board["shots"]] == ["s2", "s1"]
    assert {s["id"]: s["scene_id"] for s in board["shots"]} == {"s2": "datang", "s1": "datang"}
    assert edit("move_shot", id="nope", to_index=0).status_code == 400

    assert edit("remove_shot", id="s2").status_code == 200
    assert [s["id"] for s in _view(client, pid)["board"]["shots"]] == ["s1"]


# ---------------------------------------------------------------- look and prop sheets


def test_assets_wait_until_the_look_is_settled(client, fake_llm, bridge):
    fake_llm.turns.append([
        {"calls": [call("update_brief", summary="Iklan sepatu lari"), call("upsert_element", **MAYA)]},
        {"text": "Mau realistis seperti syuting asli, atau animasi 3D / anime?"},
    ])
    pid = client.post("/api/director/projects", json={"brief": "bikin iklan sepatu"}, headers=HEADERS).json()["project_id"]
    _wait(pid)
    board = _view(client, pid)["board"]
    assert board["elements"] == [] and bridge.submits == []
    refused = json.loads(fake_llm.requests[1]["input"][1]["output"])
    assert refused["ok"] is False and "look is not set" in refused["error"]

    fake_llm.turns.append([{"calls": [call("update_brief", look="realistic"), call("upsert_element", **MAYA)]}, {"text": "Oke."}])
    board = _say(client, pid, "realistis")["board"]
    assert board["brief"]["look"] == "realistic" and [e["id"] for e in board["elements"]] == ["maya"]
    sheet = board["media"]["element:maya"]["prompt"]
    assert "Photorealistic" in sheet and "not anime" in sheet


def test_prop_sheets_have_no_people_unless_the_story_needs_it(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    can = {"id": "can", "kind": "prop", "name": "Kaleng GASPOL", "description": "Slim 250 ml aluminium can, matte black with lime logo"}
    watch = {"id": "watch", "kind": "prop", "name": "Jam Dimas", "description": "Chunky steel diver watch with orange bezel",
             "interaction": "worn on the left wrist of a young man, wrist turned toward camera"}
    fake_llm.turns.append([{"calls": [call("upsert_element", **can), call("upsert_element", **watch)]}, {"text": "ok"}])
    media = _say(client, pid, "tambah properti")["board"]["media"]
    assert "No people, no hands" in media["element:can"]["prompt"]
    assert "No people, no hands" not in media["element:watch"]["prompt"]
    assert "worn on the left wrist" in media["element:watch"]["prompt"]
    # The look reaches frames and clips too.
    assert "Photorealistic" in media["frame:s1"]["prompt"] and "Photorealistic" in media["video:s1"]["prompt"]


def test_projects_without_a_look_keep_their_old_prompts():
    from director_service import board as boards

    item = {"id": "can", "kind": "prop", "name": "Can", "description": "Slim 250 ml aluminium can, matte black"}
    old = boards.sheet_prompt(item, "warm grain")
    assert old == boards.SHEET_TEMPLATES["prop"].format(description=item["description"]) + "\nStyle: warm grain"
    shot = {**SHOTS[0], "scene_id": None}
    board = {**boards.empty_board(), "elements": [], "shots": [shot]}
    assert boards.media_specs(board)["frame:s1"]["prompt"] == shot["frame_prompt"]


def test_only_gpt5_class_models_are_allowed(monkeypatch):
    for model in ("gpt-5.6-sol", "gpt-5.5-pro", "gpt-4.1-mini"):
        monkeypatch.setenv("DIRECTOR_LLM_MODEL", model)
        with pytest.raises(llm.LLMError, match="not allowed"):
            llm._checked_model()
    monkeypatch.delenv("DIRECTOR_LLM_MODEL")
    assert llm._checked_model() == "gpt-5.6-terra"


def test_the_brief_is_written_before_anything_is_built(client, fake_llm, bridge):
    details = {"goal": "jualan", "audience": "pelari muda Jakarta (asumsi)", "key_message": "ringan seperti tidak pakai sepatu",
               "product": "Sepatu lari Kilat, hijau neon", "cta": "Beli di Tokopedia"}
    fake_llm.turns.append([
        {"calls": [call("update_brief", look="realistic"), call("write_script", title="T", text="x"),
                   call("upsert_element", **MAYA)]},
        {"calls": [call("update_brief", summary="  Iklan sepatu lari 15 detik.  ", **details), call("upsert_element", **MAYA)]},
        {"text": "Oke."},
    ])
    pid = client.post("/api/director/projects", json={"brief": "iklan sepatu, realistis"}, headers=HEADERS).json()["project_id"]
    _wait(pid)
    first = [json.loads(i["output"]) for i in fake_llm.requests[1]["input"]]
    assert first[0]["ok"] is True  # setting only the look is allowed ...
    assert all("brief is empty" in o["error"] for o in first[1:])  # ... building on an empty brief is not
    brief = read_board(pid)["brief"]
    assert brief["summary"] == "Iklan sepatu lari 15 detik." and brief["product"] == "Sepatu lari Kilat, hijau neon"
    assert brief["avoid"] == "" and [e["id"] for e in read_board(pid)["elements"]] == ["maya"]


def test_every_result_is_kept_as_a_take(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    for _ in range(2):
        rid = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["frame:s1"], "force": True},
                          headers=HEADERS).json()["request_id"]
        assert client.post(f"/api/director/projects/{pid}/requests/{rid}/approve", headers=HEADERS).status_code == 200
        _wait(pid)
    frame = _view(client, pid)["board"]["media"]["frame:s1"]
    first, second = frame["takes"][1]["asset_id"], frame["takes"][0]["asset_id"]
    assert frame["asset_id"] == second and len(frame["takes"]) == 2 and not frame["takes"][1]["outdated"]

    assert _edit(client, pid, "use_take", key="frame:s1", asset_id=first).status_code == 200
    board = _view(client, pid)["board"]
    assert board["media"]["frame:s1"]["asset_id"] == first and not board["media"]["frame:s1"]["stale"]
    assert len(board["media"]["frame:s1"]["takes"]) == 2
    assert _edit(client, pid, "use_take", key="frame:s1", asset_id="nope").status_code == 400


def test_the_users_own_photos_make_the_sheet(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    before = len(bridge.submits)
    assert _edit(client, pid, "set_element_photos", id="maya", photos=["photo-1111-aaaa"]).status_code == 200
    _wait(pid)
    sheet = bridge.submits[-1]
    assert len(bridge.submits) == before + 1 and sheet["key"] == "element:maya"
    assert sheet["parameters"]["referenceImages"] == ["/api/assets/photo-1111-aaaa/download"]
    assert "attached reference photo" in sheet["prompt"] and "same face" in sheet["prompt"]
    # The agent rewriting the element keeps the photos.
    fake_llm.turns.append([{"calls": [call("upsert_element", **{**MAYA, "description": MAYA["description"] + ", silver earrings"})]},
                           {"text": "ok"}])
    board = _say(client, pid, "tambah anting")["board"]
    assert next(e for e in board["elements"] if e["id"] == "maya")["photos"] == ["photo-1111-aaaa"]
    assert _edit(client, pid, "set_element_photos", id="maya", photos=["../etc"]).status_code == 400


def test_the_project_shows_what_it_cost_in_credits(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    view = _view(client, pid)
    assert view["llm_credits"] >= 0
    sheets = view["generation_credits"]
    rid = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["frame:s1"]}, headers=HEADERS).json()["request_id"]
    assert client.post(f"/api/director/projects/{pid}/requests/{rid}/approve", headers=HEADERS).status_code == 200
    _wait(pid)
    frame = read_board(pid)["requests"][-1]["item_estimates"]["frame:s1"]["credits"]
    assert _view(client, pid)["generation_credits"] == round(sheets + frame, 2)


def test_a_shot_can_be_extended_and_edited(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    rid = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["video:s1"]}, headers=HEADERS).json()["request_id"]
    assert client.post(f"/api/director/projects/{pid}/requests/{rid}/approve", headers=HEADERS).status_code == 200
    _wait(pid)
    clip = read_board(pid)["media"]["video:s1"]["asset_id"]

    # Extend: a continuation right after s1, made from s1's clip, without a frame of its own.
    assert _edit(client, pid, "extend_shot", id="s1", video_prompt="She keeps walking to the sea", duration_seconds=6).status_code == 200
    board = read_board(pid)
    assert [s["id"] for s in board["shots"]][:2] == ["s1", "s1_ext2"] and board["shots"][1]["extends"] == "s1"
    media = _view(client, pid)["board"]["media"]
    assert "frame:s1_ext2" not in media
    rid = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["video:s1_ext2"]}, headers=HEADERS).json()["request_id"]
    assert read_board(pid)["requests"][-1]["items"] == ["video:s1_ext2"]
    assert client.post(f"/api/director/projects/{pid}/requests/{rid}/approve", headers=HEADERS).status_code == 200
    _wait(pid)
    sent = bridge.submits[-1]
    assert sent["key"] == "video:s1_ext2" and sent["prompt"].startswith("Extend the video")
    assert sent["parameters"]["referenceVideos"] == [f"/api/assets/{clip}/download"] and "referenceImages" not in sent["parameters"]
    assert sent["parameters"]["omniReferenceTaskType"] == "extend" and sent["parameters"]["aspectRatio"] == "adaptive"
    assert sent["parameters"]["duration"] == 6

    # Edit: the edited clip becomes s1's active take, and s1 does not turn stale.
    assert _edit(client, pid, "update_shot", id="s1", edit_instruction="make her dress red").status_code == 200
    rid = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["edit:s1"]}, headers=HEADERS).json()["request_id"]
    assert read_board(pid)["requests"][-1]["estimate"]["video_seconds"] == 0
    assert client.post(f"/api/director/projects/{pid}/requests/{rid}/approve", headers=HEADERS).status_code == 200
    _wait(pid)
    sent = bridge.submits[-1]
    assert sent["parameters"]["omniReferenceTaskType"] == "edit" and sent["parameters"]["duration"] == -1
    assert sent["parameters"]["referenceVideos"] == [f"/api/assets/{clip}/download"] and "make her dress red" in sent["prompt"]
    video = _view(client, pid)["board"]["media"]["video:s1"]
    assert video["asset_id"] != clip and not video["stale"] and [t["asset_id"] for t in video["takes"]][1] == clip
    # The continuation now builds on the edited clip, so it is outdated.
    assert _view(client, pid)["board"]["media"]["video:s1_ext2"]["stale"]


def test_extend_loops_are_ignored(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    assert _edit(client, pid, "update_shot", id="s1", extends="s2").status_code == 200
    assert _edit(client, pid, "update_shot", id="s2", extends="s1").status_code == 200
    media = _view(client, pid)["board"]["media"]
    assert "frame:s1" in media and "frame:s2" in media


def test_added_shots_and_trims_reach_the_render(client, fake_llm, bridge, tmp_path):
    pid = _built_project(client, fake_llm)
    assert _edit(client, pid, "add_shot", after="s1", description="Close up gelas es teh di meja").status_code == 200
    board = read_board(pid)
    added = board["shots"][1]
    assert added["video_prompt"] == "Close up gelas es teh di meja" and added["scene_id"] == board["shots"][0]["scene_id"]
    assert _edit(client, pid, "add_shot", description="x").status_code == 400
    assert _edit(client, pid, "remove_shot", id=added["id"]).status_code == 200

    # Trims only change the final video: the clip is not regenerated.
    rid = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["video:s1", "frame:s2"]}, headers=HEADERS).json()["request_id"]
    client.post(f"/api/director/projects/{pid}/requests/{rid}/approve", headers=HEADERS)
    _wait(pid)
    assert _edit(client, pid, "update_shot", id="s1", trim_start=0.5).status_code == 200
    assert _edit(client, pid, "update_shot", id="s1", trim_start=3, trim_end=3).status_code == 400  # keeps 1 s of 6
    media = _view(client, pid)["board"]["media"]
    assert not media["video:s1"]["stale"]
    bridge.files[media["video:s1"]["asset_id"]] = _media(tmp_path, "video")
    bridge.files[media["frame:s2"]["asset_id"]] = _media(tmp_path, "frame")
    assert client.post(f"/api/director/projects/{pid}/renders", headers=HEADERS).status_code == 201
    _wait(pid, timeout=120)
    item = read_board(pid)["renders"][-1]
    segments = [(s["shot_id"], round(s["duration"], 1)) for s in item["segments"]]
    assert item["status"] == "done" and segments == [("s1", 1.5), ("s2", 4.0)]  # the 2 s clip minus 0.5 s



def _tone(tmp_path, name, seconds):
    from director_service import render

    out = tmp_path / f"{name}.wav"
    render._run(["-y", "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}", str(out)])
    return nexoclip.Downloaded(out.read_bytes(), "audio/mpeg")


def test_voiceover_and_music_are_generated_and_mixed_into_the_render(client, fake_llm, bridge, tmp_path):
    from director_service import render

    pid = _built_project(client, fake_llm)
    fake_llm.turns.append([
        {"calls": [call("list_voices"), call("set_audio", voiceover_text="Liburan terakhir, sebelum semuanya berubah.",
                                                voice_id="JBFqnCBsd6RMkjVDRZzb", music_prompt="warm acoustic guitar, nostalgic")]},
        {"calls": [call("request_generation", items=["audio:voiceover", "audio:music"])]},
        {"text": "VO dan musik siap di-approve."},
    ])
    view = _say(client, pid, "tambahin VO dan musik")
    voices = json.loads(fake_llm.requests[-2]["input"][0]["output"])["voices"]
    assert any(v["id"] == "JBFqnCBsd6RMkjVDRZzb" for v in voices)
    audio = view["board"]["audio"]
    assert audio["voiceover"]["voice_name"] == "George" and audio["music"]["duration_seconds"] == 10  # the 2 shots
    request = view["board"]["requests"][-1]
    assert request["items"] == ["audio:voiceover", "audio:music"] and request["estimate"]["audio"] == 2

    assert client.post(f"/api/director/projects/{pid}/requests/{request['id']}/approve", headers=HEADERS).status_code == 200
    _wait(pid)
    sent = {a["parameters"]["type"]: a for a in bridge.audio}
    assert sent["voiceover"]["text"] == "Liburan terakhir, sebelum semuanya berubah."
    assert sent["voiceover"]["parameters"] == {"type": "voiceover", "voiceId": "JBFqnCBsd6RMkjVDRZzb"}
    assert sent["music"]["parameters"] == {"type": "music", "durationSeconds": 10, "instrumental": True}
    media = _view(client, pid)["board"]["media"]
    assert media["audio:voiceover"]["asset_id"] == "audio-1" and not media["audio:voiceover"]["stale"]

    rid = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["video:s1"]}, headers=HEADERS).json()["request_id"]
    client.post(f"/api/director/projects/{pid}/requests/{rid}/approve", headers=HEADERS)
    _wait(pid)
    bridge.files[_view(client, pid)["board"]["media"]["video:s1"]["asset_id"]] = _media(tmp_path, "video")
    bridge.files["audio-1"] = _tone(tmp_path, "vo", 1.5)
    bridge.files["audio-2"] = _tone(tmp_path, "music", 10)
    assert client.post(f"/api/director/projects/{pid}/renders", headers=HEADERS).status_code == 201
    _wait(pid, timeout=120)
    item = read_board(pid)["renders"][-1]
    assert item["status"] == "done", item
    assert item["audio"] == ["music", "voiceover"] and abs(item["duration_seconds"] - 2.0) < 0.3  # the video's length wins
    out = tmp_path / "mixed.mp4"
    out.write_bytes(bridge.imports[-1]["content"])
    assert render.has_audio(str(out))


def test_a_voiceover_needs_a_voice(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    fake_llm.turns.append([{"calls": [call("set_audio", voiceover_text="Halo")]}, {"text": "ok"}])
    _say(client, pid, "VO")
    refused = json.loads(fake_llm.requests[-1]["input"][0]["output"])
    assert refused["ok"] is False and "list_voices" in refused["error"]


def test_audio_is_written_with_the_openmontage_audio_guides(client, fake_llm, bridge, skill_gate):
    pid = _built_project(client, fake_llm)
    fake_llm.turns.append([
        {"calls": [call("set_audio", voiceover_text="Halo semua.", voice_id="JBFqnCBsd6RMkjVDRZzb", music_prompt="lo-fi, 85 BPM"),
                   call("set_audio", music_seconds=20)]},
        {"calls": [call("set_audio", voiceover_text="Halo semua.", voice_id="JBFqnCBsd6RMkjVDRZzb", music_prompt="lo-fi, 85 BPM")]},
        {"text": "ok"},
    ])
    board = _say(client, pid, "tambahin VO dan musik")["board"]
    first = [json.loads(i["output"]) for i in fake_llm.requests[-2]["input"]]
    assert first[0]["ok"] is False and set(first[0]["skill_content"]) == {"voice-performance-director", "music-gen-usage"}
    assert first[1]["ok"] is True  # only a length change: no guide needed
    assert board["audio"]["voiceover"]["text"] == "Halo semua." and board["audio"]["music"]["prompt"] == "lo-fi, 85 BPM"


def test_the_agent_offers_audio_options_and_the_user_picks_one(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    options = [
        {"id": "hangat", "title": "Narator hangat + akustik", "why": "nostalgia", "voice_id": "JBFqnCBsd6RMkjVDRZzb",
         "voiceover_lines": [{"shot_id": "s1", "text": "Liburan terakhir."}, {"shot_id": "s2", "text": "Sebelum semuanya berubah."}],
         "music_prompt": "acoustic guitar, 85 BPM", "instrumental": True},
        {"id": "musik", "title": "Tanpa VO, pop ceria", "why": "biar visual yang bicara", "voice_id": "",
         "voiceover_lines": [], "music_prompt": "upbeat indie pop, 120 BPM", "instrumental": True},
    ]
    fake_llm.turns.append([{"calls": [call("set_audio_options", options=options, recommended="hangat")]}, {"text": "Opsi audio ada di panel."}])
    view = _say(client, pid, "opsi audio dong")
    audio = view["board"]["audio"]
    assert [o["id"] for o in audio["options"]] == ["hangat", "musik"] and audio["options"][0]["voice_name"] == "George"
    assert any(m["meta"].get("card") == "audio" for m in view["chat"] if m["kind"] == "card")

    assert _edit(client, pid, "choose_audio_option", id="musik").status_code == 200
    audio = read_board(pid)["audio"]
    assert audio["chosen"] == "musik" and audio["music"]["prompt"] == "upbeat indie pop, 120 BPM"
    media = _view(client, pid)["board"]["media"]
    assert "audio:music" in media and not any(k.startswith("vo:") for k in media)
    assert _edit(client, pid, "choose_audio_option", id="hangat").status_code == 200
    board = read_board(pid)
    assert board["audio"]["voiceover"]["voice_id"] == "JBFqnCBsd6RMkjVDRZzb"
    assert [s["vo_text"] for s in board["shots"]] == ["Liburan terakhir.", "Sebelum semuanya berubah."]
    media = _view(client, pid)["board"]["media"]
    assert media["vo:s1"]["prompt"] == "Liburan terakhir." and media["vo:s2"]["kind"] == "audio"
    assert _edit(client, pid, "choose_audio_option", id="none").status_code == 200
    audio = read_board(pid)["audio"]
    assert audio["chosen"] == "none" and not audio["voiceover"]["text"] and not audio["music"]["prompt"]
    assert not any(k.startswith(("audio:", "vo:")) for k in _view(client, pid)["board"]["media"])
    assert all(not s["vo_text"] for s in read_board(pid)["shots"])

    bad = [{**options[0], "voice_id": ""}, options[1]]  # lines without a voice
    fake_llm.turns.append([{"calls": [call("set_audio_options", options=bad, recommended="hangat")]}, {"text": "ok"}])
    _say(client, pid, "lagi")
    assert "voice_id" in json.loads(fake_llm.requests[-1]["input"][0]["output"])["error"]



def test_voiceover_lines_play_over_their_own_shots(client, fake_llm, bridge, tmp_path):
    from director_service import render

    pid = _built_project(client, fake_llm)
    fake_llm.turns.append([
        {"calls": [call("set_audio", voice_id="JBFqnCBsd6RMkjVDRZzb",
                        lines=[{"shot_id": "s2", "text": "Rumah pantai, musim terakhir.", "offset": 0.5}])]},
        {"calls": [call("request_generation", items=["vo:s2"])]},
        {"text": "ok"},
    ])
    view = _say(client, pid, "VO di shot 2 aja")
    assert [s.get("vo_text") for s in view["board"]["shots"]] == ["", "Rumah pantai, musim terakhir."]
    assert view["board"]["requests"][-1]["items"] == ["vo:s2"]
    request = view["board"]["requests"][-1]
    assert client.post(f"/api/director/projects/{pid}/requests/{request['id']}/approve", headers=HEADERS).status_code == 200
    _wait(pid)
    assert bridge.audio[-1]["text"] == "Rumah pantai, musim terakhir."

    # Moving the shot does not touch its line; the render places it at the shot's new start.
    assert _edit(client, pid, "update_shot", id="s2", duration_seconds=5).status_code == 200
    assert not _view(client, pid)["board"]["media"]["vo:s2"]["stale"]
    rid = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["video:s1", "frame:s2"]}, headers=HEADERS).json()["request_id"]
    client.post(f"/api/director/projects/{pid}/requests/{rid}/approve", headers=HEADERS)
    _wait(pid)
    media = _view(client, pid)["board"]["media"]
    bridge.files[media["video:s1"]["asset_id"]] = _media(tmp_path, "video")
    bridge.files[media["frame:s2"]["asset_id"]] = _media(tmp_path, "frame")
    bridge.files[media["vo:s2"]["asset_id"]] = _tone(tmp_path, "line", 1.0)
    placed = []
    original = render.mix
    render_mix = lambda video, out, voices=None, music=None, music_window=None: (
        placed.extend(voices or []), original(video, out, voices=voices, music=music, music_window=music_window))
    import director_service.render as render_module
    render_module.mix = render_mix
    try:
        assert client.post(f"/api/director/projects/{pid}/renders", headers=HEADERS).status_code == 201
        _wait(pid, timeout=120)
    finally:
        render_module.mix = original
    item = read_board(pid)["renders"][-1]
    assert item["status"] == "done", item
    assert len(placed) == 1 and abs(placed[0][1] - 2.5) < 0.1  # s2 starts after s1's 2 s clip, + 0.5 s offset


def test_captions_are_drawn_into_the_render(client, fake_llm, bridge, tmp_path):
    from director_service import render

    pid = _built_project(client, fake_llm)
    assert _edit(client, pid, "update_shot", id="s2", caption="Liburan terakhir. Mulai 12 Juli di bioskop.").status_code == 200
    assert _edit(client, pid, "update_shot", id="s1", caption="x" * 200).status_code == 400
    rid = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["video:s1", "frame:s2"]}, headers=HEADERS).json()["request_id"]
    client.post(f"/api/director/projects/{pid}/requests/{rid}/approve", headers=HEADERS)
    _wait(pid)
    media = _view(client, pid)["board"]["media"]
    bridge.files[media["video:s1"]["asset_id"]] = _media(tmp_path, "video")
    bridge.files[media["frame:s2"]["asset_id"]] = _media(tmp_path, "frame")
    assert client.post(f"/api/director/projects/{pid}/renders", headers=HEADERS).status_code == 201
    _wait(pid, timeout=120)
    item = read_board(pid)["renders"][-1]
    assert item["status"] == "done", item
    out = tmp_path / "captioned.mp4"
    out.write_bytes(bridge.imports[-1]["content"])
    # The caption shows in the bottom band of shot 2's plain teal frame and nowhere above it.
    still = tmp_path / "still.png"
    render._run(["-y", "-ss", "4", "-i", str(out), "-frames:v", "1", str(still)])
    from PIL import Image

    image = Image.open(still).convert("RGB")
    w, h = image.size
    teal = image.getpixel((w // 2, h // 4))

    def changed(y0, y1):
        pixels = [image.getpixel((x, y)) for x in range(int(w * 0.3), int(w * 0.7), 8) for y in range(y0, y1, 8)]  # inside the pillarbox
        return sum(1 for p in pixels if sum(abs(a - b) for a, b in zip(p, teal)) > 60) / len(pixels)

    assert changed(int(h * 0.75), int(h * 0.95)) > 0.05 and changed(0, int(h * 0.5)) < 0.01


def test_shots_can_be_duplicated_and_added_before_another(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    rid = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["frame:s1"]}, headers=HEADERS).json()["request_id"]
    client.post(f"/api/director/projects/{pid}/requests/{rid}/approve", headers=HEADERS)
    _wait(pid)
    assert _edit(client, pid, "duplicate_shot", id="s1").status_code == 200
    assert _edit(client, pid, "add_shot", before="s1", description="Opening: ombak di pantai").status_code == 200
    board = read_board(pid)
    ids = [s["id"] for s in board["shots"]]
    assert ids[:3] == [ids[0], "s1", "s1_copy2"] and ids[0].startswith("shot_")
    media = _view(client, pid)["board"]["media"]
    assert media["frame:s1_copy2"]["asset_id"] == media["frame:s1"]["asset_id"] and not media["frame:s1_copy2"]["stale"]


def test_replies_stream_to_the_browser_as_they_are_written(client, fake_llm, bridge):
    from director_service import live

    events = []
    live.bind(lambda project_id, event: events.append(event["text"]))
    monkey_interval, live.DRAFT_INTERVAL_SECONDS = live.DRAFT_INTERVAL_SECONDS, 0.0
    try:
        fake_llm.turns.append([{"text": "Halo, mau bikin video apa hari ini?"}])
        pid = client.post("/api/director/projects", json={"brief": "hai"}, headers=HEADERS).json()["project_id"]
        _wait(pid)
    finally:
        live.DRAFT_INTERVAL_SECONDS = monkey_interval
    assert events[:2] == ["Halo,", "Halo, mau"] and "Halo, mau bikin video apa hari ini?" in events
    assert events[-1] == "Halo, mau bikin video apa hari ini?"  # the full text last; the browser swaps in the saved message
    assert _view(client, pid)["chat"][-1]["text"] == "Halo, mau bikin video apa hari ini?"


def test_the_openai_stream_is_read_into_one_response():
    from director_service import llm

    lines = [
        'data: {"type":"response.output_text.delta","delta":"Ha"}',
        "",
        'data: {"type":"response.output_text.delta","delta":"lo"}',
        'data: {"type":"response.completed","response":{"id":"r1","status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"Halo"}]}]}}',
    ]

    class Stream:
        def iter_lines(self, decode_unicode=True):
            return iter(lines)

        def close(self):
            pass

    seen = []
    payload = llm._read_stream(Stream(), seen.append)
    assert seen == ["Ha", "Halo"] and payload["id"] == "r1" and llm._output_text(payload) == "Halo"
    with pytest.raises(llm.LLMError):
        llm._read_stream(type("S", (Stream,), {"iter_lines": lambda self, decode_unicode=True: iter([])})(), seen.append)


def test_just_make_it_approves_and_exports_on_its_own(client, fake_llm, bridge):
    fake_llm.turns.append(BUILD_TURN)
    pid = client.post("/api/director/projects", json={"brief": "trailer", "run_mode": "auto"}, headers=HEADERS).json()["project_id"]
    _wait(pid)
    assert _view(client, pid)["run_mode"] == "auto"
    fake_llm.turns.append([{"calls": [call("request_generation", items=["video:s1", "video:s2"])]}, {"text": "Langsung jalan."}])
    _say(client, pid, "gas")
    deadline = time.time() + 10
    while time.time() < deadline and not read_board(pid)["renders"]:
        time.sleep(0.05)
    board = read_board(pid)
    assert [r["status"] for r in board["requests"] if not r.get("auto")] == ["done"]  # approved without a click
    assert {s["key"] for s in bridge.submits} >= {"video:s1", "video:s2"}
    assert board["renders"], "the finished video is exported by itself"
    assert "RUN MODE: Just make it" in fake_llm.requests[-1]["instructions"]

    assert client.post(f"/api/director/projects/{pid}/settings", json={"run_mode": "guide"}, headers=HEADERS).status_code == 200
    assert _view(client, pid)["run_mode"] == "guide"


def test_the_credit_gate_holds_a_request_until_there_are_credits(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    rid = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["video:s1"]}, headers=HEADERS).json()["request_id"]
    submitted = len(bridge.submits)
    bridge.credits = 3.0
    assert client.post(f"/api/director/projects/{pid}/requests/{rid}/approve", headers=HEADERS).status_code == 200
    _wait(pid)
    view = _view(client, pid)
    request = next(r for r in view["board"]["requests"] if r["id"] == rid)
    assert request["status"] == "needs_credits" and request["credit_gate"] == {"needed": 31.0, "balance": 3.0}
    assert view["chat"][-1]["kind"] == "credit_gate" and len(bridge.submits) == submitted
    bridge.credits = 100.0  # topped up: "Lanjutkan"
    assert client.post(f"/api/director/projects/{pid}/requests/{rid}/approve", headers=HEADERS).status_code == 200
    _wait(pid)
    assert next(r for r in read_board(pid)["requests"] if r["id"] == rid)["status"] == "done"


def test_a_new_project_needs_a_minimum_balance(client, fake_llm, bridge, monkeypatch):
    from director_service import nexoclip as nexoclip_mod

    monkeypatch.setattr(nexoclip_mod, "configured", lambda: True)
    monkeypatch.setattr(nexoclip_mod, "Bridge", lambda owner: bridge)
    bridge.credits = 40.0
    res = client.post("/api/director/projects", json={"brief": "iklan"}, headers=HEADERS)
    assert res.status_code == 402 and "100" in res.json()["detail"]
    bridge.credits = 150.0
    res = client.post("/api/director/projects", json={"brief": "hai"}, headers=HEADERS)
    assert res.status_code == 201
    _wait(res.json()["project_id"])


def test_attachments_and_mentions_reach_the_director_and_the_shots(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    photo, clip = "aaaaaaaa-1111-4111-8111-000000000001", "aaaaaaaa-1111-4111-8111-000000000002"
    fake_llm.turns.append([
        {"calls": [call("upsert_element", **MAYA, photos=[photo]),
                   call("update_shot", id="s1", reference_assets=[{"asset_id": clip, "kind": "video"}])]},
        {"text": "Siap."},
    ])
    res = client.post(f"/api/director/projects/{pid}/messages", headers=HEADERS, json={
        "text": "ini foto Maya, dan pakai video ini buat gerakan di @1.1",
        "attachments": [{"asset_id": photo, "kind": "image", "name": "maya.jpg"}, {"asset_id": clip, "kind": "video", "name": "walk.mp4"}],
        "mentions": [{"type": "shot", "id": "s1", "label": "1.1"}]})
    assert res.status_code == 200
    _wait(pid)
    sent = fake_llm.requests[-2]["input"][-1]["content"]
    assert f"image asset_id={photo} (maya.jpg)" in sent and "@1.1 = shot s1" in sent
    view = _view(client, pid)
    sent_message = next(m for m in view["chat"] if m["text"].startswith("ini foto Maya"))
    assert sent_message["meta"]["attachments"][1]["kind"] == "video"
    board = read_board(pid)
    assert next(e for e in board["elements"] if e["id"] == "maya")["photos"] == [photo]
    rid = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["video:s1"]}, headers=HEADERS).json()["request_id"]
    client.post(f"/api/director/projects/{pid}/requests/{rid}/approve", headers=HEADERS)
    _wait(pid)
    video = next(s for s in bridge.submits if s["key"] == "video:s1")
    assert video["parameters"]["referenceVideos"] == [f"/api/assets/{clip}/download"]
    assert "@Video1 is a reference video the user gave" in video["prompt"]
    bad = client.post(f"/api/director/projects/{pid}/messages", headers=HEADERS,
                      json={"text": "x", "attachments": [{"asset_id": "../etc", "kind": "image"}]})
    assert bad.status_code == 422


def test_the_director_sees_attached_images_but_not_videos(client, fake_llm, bridge, tmp_path):
    pid = _built_project(client, fake_llm)
    photo, clip = "bbbbbbbb-1111-4111-8111-000000000001", "bbbbbbbb-1111-4111-8111-000000000002"
    bridge.files[photo] = _media(tmp_path, "frame")  # a real 400x400 PNG
    fake_llm.turns.append([{"text": "Itu cup kopi oranye."}])
    res = client.post(f"/api/director/projects/{pid}/messages", headers=HEADERS, json={
        "text": "ini produknya", "attachments": [{"asset_id": photo, "kind": "image", "name": "cup.png"},
                                                 {"asset_id": clip, "kind": "video", "name": "walk.mp4"}]})
    assert res.status_code == 200
    _wait(pid)
    content = fake_llm.requests[-1]["input"][-1]["content"]
    assert content[0]["type"] == "input_text" and f"video asset_id={clip}" in content[0]["text"]
    images = [p for p in content if p["type"] == "input_image"]
    assert len(images) == 1 and images[0]["image_url"].startswith("data:image/jpeg;base64,")

    # Only the latest few messages carry their images; older ones keep just the ids.
    for n in range(3):
        fake_llm.turns.append([{"text": "ok"}])
        other = f"bbbbbbbb-1111-4111-8111-00000000010{n}"
        bridge.files[other] = _media(tmp_path, "frame")
        client.post(f"/api/director/projects/{pid}/messages", headers=HEADERS,
                    json={"text": f"foto {n}", "attachments": [{"asset_id": other, "kind": "image"}]})
        _wait(pid)
    history = fake_llm.requests[-1]["input"]
    first = next(m for m in history if m["role"] == "user" and "ini produknya" in str(m["content"]))
    assert isinstance(first["content"], str) and f"image asset_id={photo}" in first["content"]



def test_the_video_analyst_watches_attached_videos(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    clip = "cccccccc-1111-4111-8111-000000000001"
    fake_llm.turns.append([{"calls": [call("analyze_video", asset_id=clip, question="when does she smile?")]}, {"text": "Oke."}])
    client.post(f"/api/director/projects/{pid}/messages", headers=HEADERS, json={
        "text": "bikin mirip video ini", "attachments": [{"asset_id": clip, "kind": "video", "name": "walk.mp4"}]})
    _wait(pid)
    assert [w["question"] for w in bridge.watched] == ["", "when does she smile?"]
    assert read_board(pid)["video_notes"][clip].startswith("00:00-00:03 a woman walks")
    sent = str(fake_llm.requests[-2]["input"][-1]["content"])
    assert "[video analyst, watched video" in sent and "golden hour (overview)" in sent
    answer = json.loads(fake_llm.requests[-1]["input"][0]["output"])
    assert "when does she smile?" in answer["answer"]
    assert any(m["text"] == "Menonton video: walk.mp4" for m in _view(client, pid)["chat"])

    # Watched once: the next turn does not pay for it again.
    fake_llm.turns.append([{"text": "ok"}])
    _say(client, pid, "lanjut")
    assert len(bridge.watched) == 2


def test_prompts_name_elements_with_mentions(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    assert _edit(client, pid, "update_shot", id="s2", element_ids=[],
                 frame_prompt="Wide: @maya waves from the porch of @beach_house at golden hour",
                 video_prompt="@maya runs down the steps of @beach_house, camera tracks left; @ghost stays as text").status_code == 200
    shot = next(s for s in read_board(pid)["shots"] if s["id"] == "s2")
    assert shot["element_ids"] == ["maya", "beach_house"]  # mentioned elements join the shot
    media = _view(client, pid)["board"]["media"]
    frame = media["frame:s2"]["prompt"]
    assert frame.startswith("Wide: Maya (reference image 1) waves from the porch of Beach house (reference image 2)")
    assert "image 2 is the reference sheet of Beach house" in frame
    video = media["video:s2"]["prompt"]
    assert video.startswith("Maya (@Image2) runs down the steps of Beach house (@Image3)") and "@ghost" in video
    # Prompts without mentions keep their old wording, so finished frames do not turn stale.
    assert "reference image" not in media["frame:s1"]["prompt"]



def test_the_guides_follow_the_video_type(client, fake_llm, bridge):
    # "buatin UGC skincare": the Director reads that as a UGC ad and the guides follow.
    fake_llm.turns.append([
        {"calls": [call("update_brief", summary="UGC TikTok review serum", video_type="ugc_ad")]},
        {"calls": [call("read_skill", name="idea-director"), call("read_skill", name="scene-director")]},
        {"text": "Siap, aku bikin sebagai UGC ad."},
    ])
    pid = client.post("/api/director/projects", json={"brief": "buatin UGC review serum"}, headers=HEADERS).json()["project_id"]
    _wait(pid)
    assert "VIDEO TYPE: not set yet" in fake_llm.requests[0]["instructions"]
    guides = [json.loads(i["output"]) for i in fake_llm.requests[2]["input"]]
    assert "# UGC Ad" in guides[0]["content"] and "# UGC Ad" in guides[1]["content"]
    # The instructions stay identical within a turn (prompt cache); the next turn names the type.
    assert fake_llm.requests[2]["instructions"] == fake_llm.requests[0]["instructions"]

    # The user changes direction: the same role names now load the drama guides.
    fake_llm.turns.append([
        {"calls": [call("update_brief", video_type="micro_drama"), call("read_skill", name="script-director")]},
        {"calls": [call("update_brief", video_type="podcast")]},
        {"text": "ok"},
    ])
    _say(client, pid, "eh ganti, jadi drama vertikal berseri aja")
    turn_start = next(r for r in fake_llm.requests if r["previous"] is None and "VIDEO TYPE: UGC ad (ugc_ad)" in r["instructions"])
    assert "8 (UGC-style ad)" in turn_start["instructions"]
    later = json.loads(fake_llm.requests[-2]["input"][1]["output"])
    assert "# Micro-Drama" in later["content"]
    assert "video_type must be one of" in json.loads(fake_llm.requests[-1]["input"][0]["output"])["error"]
    assert read_board(pid)["brief"]["video_type"] == "micro_drama"



def test_each_video_type_has_its_guides_and_example(client, fake_llm):
    from director_service import skills

    assert "# Worked Example — Vertical Micro-Drama" in skills.read("example-prompt", "micro_drama")
    assert "Worked Example" in skills.read("example-prompt", "music_video")
    assert "### Music video" in skills.read("idea-director", "music_video")  # the genre modules
    assert "# Dramaturgy, detail, montage" in skills.read("scene-director", "short_film")
    assert "## 2. Screenwriter mode" in skills.read("script-director", "short_film")
    assert "Scene Director - Cinematic Pipeline" in skills.read("scene-director", "trailer")
    with pytest.raises(KeyError):
        skills.read("example-prompt", "presenter")  # no worked example for this type
    for kind in skills.VIDEO_TYPES:  # every guide a type points at exists
        for role in ("idea-director", "script-director", "scene-director", "asset-director"):
            assert skills.read(role, kind)


def test_voiceover_lines_without_a_voice_are_flagged(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    fake_llm.turns.append([{"calls": [call("update_shot", id="s1", vo_text="Liburan terakhir.")]}, {"text": "ok"}])
    _say(client, pid, "VO di shot 1")
    result = json.loads(fake_llm.requests[-1]["input"][0]["output"])
    assert result["ok"] and "no voice is chosen" in result["note"]


def test_cached_input_is_billed_at_the_cached_rate():
    from director_service import llm as llm_mod

    payload = {"usage": {"input_tokens": 100_000, "output_tokens": 1_000, "input_tokens_details": {"cached_tokens": 90_000}}}
    assert llm_mod.cached_tokens(payload["usage"]) == 90_000
    cost = llm_mod._cost_usd("gpt-5.6-terra", payload)
    assert abs(cost - (10_000 * 2.0 + 90_000 * 0.2 + 1_000 * 12.0) / 1e6) < 1e-12


def test_the_users_own_media_fills_a_shot_and_stays(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    image, clip = "dddddddd-1111-4111-8111-000000000001", "dddddddd-1111-4111-8111-000000000002"
    assert _edit(client, pid, "set_shot_media", id="s1", kind="frame", asset_id=image).status_code == 200
    assert _edit(client, pid, "set_shot_media", id="s2", kind="video", asset_id=clip).status_code == 200
    media = _view(client, pid)["board"]["media"]
    assert media["frame:s1"]["asset_id"] == image and not media["frame:s1"]["stale"]
    assert media["video:s2"]["asset_id"] == clip and not media["video:s2"]["stale"]  # no frame needed for an uploaded clip
    # A prompt change does not mark the user's file as outdated, and the render uses it.
    assert _edit(client, pid, "update_shot", id="s1", frame_prompt="a different opening").status_code == 200
    assert not _view(client, pid)["board"]["media"]["frame:s1"]["stale"]
    from director_service import render

    assert [(s["shot_id"], s["source"], s["asset_id"]) for s in render.plan(read_board(pid))] == [("s1", "frame", image), ("s2", "video", clip)]
    # "Generate semua" leaves an uploaded clip alone.
    res = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["video:s2"]}, headers=HEADERS)
    assert res.status_code == 400
    assert _edit(client, pid, "set_shot_media", id="s1", kind="sound", asset_id=image).status_code == 400


def test_scenes_and_batches_are_managed_from_the_board(client, fake_llm, bridge):
    pid = _built_project(client, fake_llm)
    # The first scene added from the board takes the shots that had none.
    assert _edit(client, pid, "add_scene", title="Siang di pantai").status_code == 200
    board = read_board(pid)
    first = board["scenes"][0]["id"]
    assert all(s["scene_id"] == first for s in board["shots"])
    assert _edit(client, pid, "add_scene", title="Malam di pantai", description="api unggun", after=first).status_code == 200
    board = read_board(pid)
    new = board["scenes"][1]
    assert new["title"] == "Malam di pantai" and new["id"].startswith("scene_")
    assert _edit(client, pid, "update_scene", id=new["id"], title="Malam terakhir").status_code == 200
    assert _edit(client, pid, "batch_shots", ids=["s1", "s2"], action="move_scene", scene_id=new["id"]).status_code == 200
    assert {s["scene_id"] for s in read_board(pid)["shots"]} == {new["id"]}
    # Removing a scene keeps its shots in the scene before it.
    assert _edit(client, pid, "remove_scene", id=new["id"]).status_code == 200
    board = read_board(pid)
    assert [s["title"] for s in board["scenes"]] == ["Siang di pantai"]
    assert all(s["scene_id"] == board["scenes"][0]["id"] for s in board["shots"])
    assert _edit(client, pid, "batch_shots", ids=["s1", "s2"], action="remove").status_code == 200
    assert read_board(pid)["shots"] == []
    assert _edit(client, pid, "add_scene", title="").status_code == 400



def test_track_timings_are_set_on_the_timeline_and_rendered(client, fake_llm, bridge, tmp_path):
    from director_service import render
    from PIL import Image

    pid = _built_project(client, fake_llm)
    fake_llm.turns.append([{"calls": [call("set_audio", voice_id="JBFqnCBsd6RMkjVDRZzb", music_prompt="lo-fi",
                                           lines=[{"shot_id": "s1", "text": "Halo."}])]}, {"text": "ok"}])
    _say(client, pid, "VO dan musik")
    # Dragged on the timeline: cut the line, show the caption only in the last 2 s of shot 2, music from 0.5 s to 2 s.
    assert _edit(client, pid, "update_shot", id="s1", vo_trim_start=0.2, vo_trim_end=0.3).status_code == 200
    assert _edit(client, pid, "update_shot", id="s2", caption="Sampai jumpa", caption_start=2, caption_end=4).status_code == 200
    assert _edit(client, pid, "update_shot", id="s2", caption_start=3, caption_end=2).status_code == 400
    assert _edit(client, pid, "set_audio", music_start=0.5, music_trim_start=1, music_end=2).status_code == 200
    assert _edit(client, pid, "set_audio", music_start=3, music_end=2).status_code == 400
    board = read_board(pid)
    assert board["audio"]["music"]["start"] == 0.5 and board["audio"]["music"]["end"] == 2
    # Timing never makes the generated audio outdated.
    media = _view(client, pid)["board"]["media"]
    rid = client.post(f"/api/director/projects/{pid}/requests", json={"items": ["video:s1", "frame:s2", "vo:s1", "audio:music"]}, headers=HEADERS).json()["request_id"]
    client.post(f"/api/director/projects/{pid}/requests/{rid}/approve", headers=HEADERS)
    _wait(pid)
    media = _view(client, pid)["board"]["media"]
    bridge.files[media["video:s1"]["asset_id"]] = _media(tmp_path, "video")
    bridge.files[media["frame:s2"]["asset_id"]] = _media(tmp_path, "frame")
    bridge.files[media["vo:s1"]["asset_id"]] = _tone(tmp_path, "line", 1.5)
    bridge.files[media["audio:music"]["asset_id"]] = _tone(tmp_path, "music", 10)
    assert client.post(f"/api/director/projects/{pid}/renders", headers=HEADERS).status_code == 201
    _wait(pid, timeout=120)
    item = read_board(pid)["renders"][-1]
    assert item["status"] == "done", item
    out = tmp_path / "timed.mp4"
    out.write_bytes(bridge.imports[-1]["content"])
    # Shot 2 starts at 2 s: no caption at 3 s (1 s into the shot), the caption at 5 s (3 s into it).
    def band(at):
        still = tmp_path / f"still_{at}.png"
        render._run(["-y", "-ss", str(at), "-i", str(out), "-frames:v", "1", str(still)])
        image = Image.open(still).convert("RGB")
        w, h = image.size
        teal = image.getpixel((w // 2, h // 4))
        pixels = [image.getpixel((x, y)) for x in range(int(w * 0.3), int(w * 0.7), 8) for y in range(int(h * 0.75), int(h * 0.95), 8)]
        return sum(1 for p in pixels if sum(abs(a - b) for a, b in zip(p, teal)) > 60) / len(pixels)
    assert band(3) < 0.01 and band(5) > 0.05
