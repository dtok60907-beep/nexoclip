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

    def respond(self, input_items, *, instructions, tools, previous_response_id=None, max_tokens=8000):
        self.requests.append({"input": input_items, "instructions": instructions, "previous": previous_response_id})
        if previous_response_id is None:
            self._steps = list(self.turns.pop(0)) if self.turns else [{"text": "Oke."}]
        step = self._steps.pop(0) if self._steps else {"text": "Selesai."}
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

    def status(self, generation_id):
        return self._gens[generation_id]

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
    assert "CURRENT PROJECT BOARD" in second["instructions"] and '"maya"' in second["instructions"]
    assert [x["key"] for x in bridge.submits] == ["element:maya", "element:beach_house"]


def test_tool_errors_are_returned_to_the_model(client, fake_llm, skill_gate):
    fake_llm.turns.append([
        {"calls": [call("update_brief", look="realistic"), call("set_shots", shots=SHOTS)]},  # no prompt guide read yet
        {"calls": [call("read_skill", name="seedance-prompting"), call("set_shots", shots=SHOTS)]},  # elements missing
        {"calls": [call("read_skill", name="image-gen-usage"), call("upsert_element", **MAYA), call("upsert_element", **HOUSE)]},
        {"calls": [call("set_shots", shots=SHOTS)]},
        {"text": "Sudah."},
    ])
    pid = client.post("/api/director/projects", json={"brief": "trailer"}, headers=HEADERS).json()["project_id"]
    _wait(pid)
    refused = json.loads(fake_llm.requests[1]["input"][1]["output"])
    assert refused["ok"] is False and "needs the seedance-prompting guide" in refused["error"]
    assert "Seedance 2.0" in refused["skill_content"]["seedance-prompting"]
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
    assert "- seedance-prompting:" in first and "Seedance 2.0 — Prompting Guide" not in first
    outputs = [json.loads(i["output"]) for i in fake_llm.requests[1]["input"]]
    assert outputs[0]["ok"] and "Seedance 2.0" in outputs[0]["content"]
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
    fake_llm.turns.append([{"calls": [call("set_concepts", options=options, recommended="warm")]}, {"text": "Aku rekomendasi Hangat."}])
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
    # idea-director was loaded by the first refusal, so set_concepts now fails on its own validation.
    assert first[3]["error"] == "give 2-3 concept options"
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
    assert request["estimate"] == {"available": True, "images": 1, "videos": 1, "video_seconds": 6, "credits": 31.0, "usd": 0.31}
    assert len(bridge.submits) == 2  # only the automatic sheets so far

    res = client.post(f"/api/director/projects/{pid}/requests/{request['id']}/approve", headers=HEADERS)
    assert res.status_code == 200, res.text
    _wait(pid)
    by_key = {x["key"]: x for x in bridge.submits}
    assert by_key["frame:s1"]["parameters"]["referenceImages"] == ["/api/assets/asset-gen1/download", "/api/assets/asset-gen2/download"]
    assert by_key["video:s1"]["parameters"] == {"aspectRatio": "16:9", "duration": 6, "resolution": "720p", "generateAudio": False,
                                                "referenceImages": ["/api/assets/asset-gen3/download"]}
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
        {"calls": [call("upsert_element", **MAYA)]},
        {"text": "Mau realistis seperti syuting asli, atau animasi 3D / anime?"},
    ])
    pid = client.post("/api/director/projects", json={"brief": "bikin iklan sepatu"}, headers=HEADERS).json()["project_id"]
    _wait(pid)
    board = _view(client, pid)["board"]
    assert board["elements"] == [] and bridge.submits == []
    refused = json.loads(fake_llm.requests[1]["input"][0]["output"])
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
