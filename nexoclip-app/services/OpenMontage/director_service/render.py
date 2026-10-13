"""Final video: the shots joined into one MP4, in timeline order.

Free (no model calls): each shot's generated video is used, or its frame held
still for the shot's duration when it has no video yet. Every segment is
normalised to the same size, frame rate and audio format with ffmpeg, then
joined without re-encoding. The result is imported into the user's nexoclip
workspace as an asset, like every other generated media.
"""

from __future__ import annotations

import os
import re
import subprocess
import tempfile
import uuid
from typing import Any, Callable, Optional

from director_service import billing
from director_service.board import TERMINAL_OK, read_board, update_board
from director_service.store import now_iso

FPS = 24
HEIGHTS = {"480p": 480, "720p": 720, "1080p": 1080}
MAX_BYTES = 200 * 1024 * 1024  # MAX_RENDER_BYTES of nexoclip's render-upload route
FFMPEG_TIMEOUT_SECONDS = 600


class RenderError(RuntimeError):
    pass


def ffmpeg_exe() -> str:
    """The ffmpeg bundled with imageio-ffmpeg (has libx264 + aac), or one on PATH."""
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def canvas_size(aspect_ratio: str, resolution: str) -> tuple[int, int]:
    short = HEIGHTS.get(resolution or "720p", 720)
    long = int(round(short * 16 / 9 / 2)) * 2
    if aspect_ratio == "9:16":
        return short, long
    if aspect_ratio == "1:1":
        return short, short
    return long, short


def ordered_shots(board: dict[str, Any]) -> list[dict[str, Any]]:
    """Shots in the order the timeline shows them: by scene, then shots without a scene."""
    if not board["scenes"]:
        return list(board["shots"])
    scene_ids = [s["id"] for s in board["scenes"]]
    ordered = [shot for sid in scene_ids for shot in board["shots"] if shot.get("scene_id") == sid]
    return ordered + [shot for shot in board["shots"] if shot.get("scene_id") not in scene_ids]


def plan(board: dict[str, Any]) -> list[dict[str, Any]]:
    """One segment per shot that has something to show; the latest generated media wins."""
    segments = []
    for shot in ordered_shots(board):
        video = board["media"].get(f"video:{shot['id']}") or {}
        frame = board["media"].get(f"frame:{shot['id']}") or {}
        if video.get("status") == TERMINAL_OK and video.get("asset_id"):
            source, asset_id = "video", video["asset_id"]
        elif frame.get("status") == TERMINAL_OK and frame.get("asset_id"):
            source, asset_id = "frame", frame["asset_id"]
        else:
            continue
        trim_start, trim_end = float(shot.get("trim_start") or 0), float(shot.get("trim_end") or 0)
        segments.append({"shot_id": shot["id"], "title": shot.get("title") or shot["id"], "source": source,
                         "asset_id": asset_id, "duration": max(1.0, float(shot.get("duration_seconds") or 5) - trim_start - trim_end),
                         "trim_start": trim_start, "trim_end": trim_end})
    return segments


# ---------------------------------------------------------------- ffmpeg


def _run(args: list[str]) -> str:
    try:
        done = subprocess.run([ffmpeg_exe(), "-hide_banner", "-nostdin", *args], capture_output=True, text=True,
                              timeout=FFMPEG_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired as exc:
        raise RenderError("ffmpeg timed out") from exc
    if done.returncode != 0:
        tail = done.stderr.strip().splitlines()[-3:]
        raise RenderError("ffmpeg failed: " + " | ".join(tail)[:300])
    return done.stderr


def has_audio(path: str) -> bool:
    probe = subprocess.run([ffmpeg_exe(), "-hide_banner", "-nostdin", "-i", path], capture_output=True, text=True)
    return bool(re.search(r"Stream #\S+.*: Audio:", probe.stderr))


def _video_filter(width: int, height: int) -> str:
    return (f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps={FPS},format=yuv420p")


ENCODE = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-r", str(FPS),
          "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"]
SILENCE = ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]


def normalise(source: str, kind: str, duration: float, out: str, size: tuple[int, int], *,
              trim_start: float = 0.0, trim_end: float = 0.0) -> None:
    """Re-encode one segment so every segment shares codec, size, fps and audio layout. A clip is cut by
    trim_start / trim_end seconds (always keeping at least a second of it)."""
    vf = _video_filter(*size)
    if kind == "frame":
        _run(["-y", "-loop", "1", "-t", f"{duration:.3f}", "-i", source, *SILENCE,
              "-vf", vf, "-map", "0:v", "-map", "1:a", "-t", f"{duration:.3f}", *ENCODE, out])
        return
    cut: list[str] = []
    if trim_start or trim_end:
        length = duration_of(source)
        start = min(trim_start, max(0.0, length - 1.0))
        keep = max(1.0, length - start - trim_end) if length else 0.0
        cut = ["-ss", f"{start:.3f}", *(["-t", f"{keep:.3f}"] if keep else [])]
    if has_audio(source):
        _run(["-y", *cut, "-i", source, "-vf", vf, "-map", "0:v", "-map", "0:a", *ENCODE, out])
    else:
        _run(["-y", *cut, "-i", source, *SILENCE, "-vf", vf, "-map", "0:v", "-map", "1:a", "-shortest", *ENCODE, out])


def join(segments: list[str], out: str) -> None:
    listing = out + ".txt"
    with open(listing, "w", encoding="utf-8") as fh:
        for path in segments:
            fh.write(f"file '{path}'\n")
    _run(["-y", "-f", "concat", "-safe", "0", "-i", listing, "-c", "copy", "-movflags", "+faststart", out])


# Volumes when the separate tracks are laid over the clips: with a voiceover, the clips' own sound and the
# music step back so the voice stays clear.
CLIP_VOLUME = {"with_voice": 0.45, "alone": 1.0}
MUSIC_VOLUME = {"with_voice": 0.22, "alone": 0.6}
MUSIC_FADE_SECONDS = 2.0


def audio_tracks(board: dict[str, Any]) -> dict[str, str]:
    """Finished voiceover / music assets, by "voiceover" / "music"."""
    tracks = {}
    for name in ("voiceover", "music"):
        media = board["media"].get(f"audio:{name}") or {}
        if media.get("status") == TERMINAL_OK and media.get("asset_id"):
            tracks[name] = media["asset_id"]
    return tracks


def voice_lines(board: dict[str, Any]) -> dict[str, str]:
    """Finished voiceover lines whose text is still on their shot, by shot id."""
    lines = {}
    for shot in board["shots"]:
        media = board["media"].get(f"vo:{shot['id']}") or {}
        if (shot.get("vo_text") or "").strip() and media.get("status") == TERMINAL_OK and media.get("asset_id"):
            lines[shot["id"]] = media["asset_id"]
    return lines


def mix(video: str, out: str, *, voices: Optional[list[tuple[str, float]]] = None, music: Optional[str] = None) -> None:
    """Lay voice clips (each from its start second) and the music bed over the joined video; the video's
    length wins."""
    length = duration_of(video)
    voices = voices or []
    inputs, chains, labels = ["-i", video], [], []
    voiced = "with_voice" if voices else "alone"
    chains.append(f"[0:a]volume={CLIP_VOLUME[voiced]}[clips]")
    labels.append("[clips]")
    for index, (path, start) in enumerate(voices):
        inputs += ["-i", path]
        delay = int(round(max(0.0, start) * 1000))
        chains.append(f"[{len(labels)}:a]aresample=48000,adelay={delay}:all=1,apad[vo{index}]")
        labels.append(f"[vo{index}]")
    if music:
        inputs += ["-i", music]
        fade_at = max(0.0, length - MUSIC_FADE_SECONDS)
        chains.append(f"[{len(labels)}:a]aresample=48000,volume={MUSIC_VOLUME[voiced]},"
                      f"afade=t=out:st={fade_at:.2f}:d={MUSIC_FADE_SECONDS},apad[music]")
        labels.append("[music]")
    chains.append(f"{''.join(labels)}amix=inputs={len(labels)}:duration=first:normalize=0[mixed]")
    _run(["-y", *inputs, "-filter_complex", ";".join(chains), "-map", "0:v", "-map", "[mixed]",
          "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
          "-t", f"{length:.3f}", "-movflags", "+faststart", out])


def duration_of(path: str) -> float:
    probe = subprocess.run([ffmpeg_exe(), "-hide_banner", "-nostdin", "-i", path], capture_output=True, text=True)
    match = re.search(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", probe.stderr)
    if not match:
        return 0.0
    h, m, s = match.groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


# ---------------------------------------------------------------- state


def find(board: dict[str, Any], render_id: str) -> Optional[dict[str, Any]]:
    return next((r for r in board["renders"] if r["id"] == render_id), None)


def _set(project_id: str, render_id: str, **fields: Any) -> None:
    def change(board: dict[str, Any]) -> None:
        item = find(board, render_id)
        if item is not None:
            item.update(fields)

    update_board(project_id, change)


def create(project_id: str) -> dict[str, Any]:
    board = read_board(project_id)
    segments = plan(board)
    if not segments:
        raise RenderError("belum ada shot dengan frame atau video yang sudah jadi untuk dirender")
    item = {
        "id": f"render_{uuid.uuid4().hex[:10]}", "status": "pending", "created_at": now_iso(), "error": None,
        "board_version": board.get("version"), "shots": [s["shot_id"] for s in segments],
        "stills": sum(1 for s in segments if s["source"] == "frame"),
        "skipped": len(board["shots"]) - len(segments),
        "progress": {"done": 0, "total": len(segments)},
        "audio": sorted(audio_tracks(board)),  # separate tracks laid over the clips
        "voice_lines": len(voice_lines(board)),
        "aspect_ratio": board["brief"].get("aspect_ratio") or "16:9",
        "resolution": board["brief"].get("resolution") or "720p",
    }

    def change(b: dict[str, Any]) -> None:
        b["renders"] = [*b["renders"], item][-20:]  # keep the latest renders only

    update_board(project_id, change)
    return item


def run(project_id: str, render_id: str, *, download: Optional[Callable[[str], tuple[bytes, str]]] = None,
        upload: Optional[Callable[[bytes, str], str]] = None) -> dict[str, Any]:
    """Build the MP4 for a created render and store it as a nexoclip asset."""
    board = read_board(project_id)
    item = find(board, render_id)
    if item is None:
        raise RenderError("render not found")
    if download is None or upload is None:
        bridge = billing.bridge_for(project_id)
        if bridge is None:
            raise RenderError("render butuh koneksi ke nexoclip (bridge belum dikonfigurasi)")
        download = download or (lambda asset_id: (lambda d: (d.content, d.content_type))(bridge.download(asset_id)))
        upload = upload or (lambda content, filename: bridge.upload_render(content=content, filename=filename))

    by_shot = {s["shot_id"]: s for s in plan(board)}
    segments = [by_shot[sid] for sid in item["shots"] if sid in by_shot]
    if not segments:
        raise RenderError("shot yang mau dirender sudah tidak punya media")
    size = canvas_size(item["aspect_ratio"], item["resolution"])
    _set(project_id, render_id, status="running", started_at=now_iso(), progress={"done": 0, "total": len(segments)})

    with tempfile.TemporaryDirectory(prefix="director-render-") as tmp:
        parts = []
        placed = []  # where each shot sits in the final video, for the timeline
        cursor = 0.0
        for index, seg in enumerate(segments):
            content, content_type = download(seg["asset_id"])
            ext = ".mp4" if seg["source"] == "video" else (".png" if "png" in content_type else ".jpg")
            raw = os.path.join(tmp, f"raw_{index}{ext}")
            with open(raw, "wb") as fh:
                fh.write(content)
            part = os.path.join(tmp, f"seg_{index:03d}.mp4")
            normalise(raw, seg["source"], seg["duration"], part, size,
                      trim_start=seg.get("trim_start", 0.0), trim_end=seg.get("trim_end", 0.0))
            parts.append(part)
            length = round(duration_of(part), 3)
            placed.append({"shot_id": seg["shot_id"], "source": seg["source"], "start": round(cursor, 3), "duration": length})
            cursor += length
            _set(project_id, render_id, progress={"done": index + 1, "total": len(segments)})
        out = os.path.join(tmp, "final.mp4")
        tracks = {name: asset for name, asset in audio_tracks(board).items() if name in item.get("audio", [])}
        starts = {p["shot_id"]: p["start"] for p in placed}
        offsets = {s["id"]: float(s.get("vo_offset") or 0) for s in board["shots"]}
        lines = {sid: asset for sid, asset in voice_lines(board).items() if sid in starts}
        if tracks or lines:
            joined = os.path.join(tmp, "joined.mp4")
            join(parts, joined)

            def fetch(asset_id: str, name: str) -> str:
                content, _ = download(asset_id)
                path = os.path.join(tmp, f"{name}.mp3")
                with open(path, "wb") as fh:
                    fh.write(content)
                return path

            voices = [(fetch(asset, f"vo_{sid}"), starts[sid] + offsets.get(sid, 0.0)) for sid, asset in lines.items()]
            if "voiceover" in tracks:  # the older single narration, read from the start
                voices.append((fetch(tracks["voiceover"], "voiceover"), 0.0))
            music = fetch(tracks["music"], "music") if "music" in tracks else None
            mix(joined, out, voices=voices, music=music)
        else:
            join(parts, out)
        total_seconds = round(duration_of(out), 2)
        with open(out, "rb") as fh:
            data = fh.read()
    if len(data) > MAX_BYTES:
        raise RenderError(f"hasil render {len(data) // (1024 * 1024)} MB, melebihi batas 200 MB; coba resolusi lebih kecil")
    title = re.sub(r"[^A-Za-z0-9 _-]+", "", (board["script"] or {}).get("title") or project_id).strip() or "director"
    asset_id = upload(data, f"{title[:60]}.mp4")
    _set(project_id, render_id, status="done", asset_id=asset_id, size_bytes=len(data), duration_seconds=total_seconds,
         segments=placed,
         width=size[0], height=size[1], finished_at=now_iso())
    return find(read_board(project_id), render_id)


def fail(project_id: str, render_id: str, error: str) -> None:
    _set(project_id, render_id, status="failed", error=error[:300], finished_at=now_iso())


def interrupted(project_id: str) -> None:
    """Renders left pending/running by a restart: mark them failed so the user can render again."""
    def change(board: dict[str, Any]) -> None:
        for item in board["renders"]:
            if item["status"] in ("pending", "running"):
                item.update(status="failed", error="Render terputus (service restart). Coba render lagi.")

    if any(r["status"] in ("pending", "running") for r in read_board(project_id)["renders"]):
        update_board(project_id, change)
