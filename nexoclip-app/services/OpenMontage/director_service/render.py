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
EXPORT_FPS = (24, 30, 60)
EXPORT_FORMATS = ("mp4", "mov")  # both H.264 + AAC; MOV for editors that prefer QuickTime
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
    """The resolution is the short side; the long side follows the ratio (even pixels, as x264 needs)."""
    short = HEIGHTS.get(resolution or "720p", 720)
    try:
        w, h = (int(n) for n in (aspect_ratio or "16:9").split(":"))
    except ValueError:
        w, h = 16, 9
    long = int(round(short * max(w, h) / min(w, h) / 2)) * 2
    return (long, short) if w >= h else (short, long)


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
                         "trim_start": trim_start, "trim_end": trim_end, "caption": (shot.get("caption") or "").strip(),
                         "caption_start": float(shot.get("caption_start") or 0),
                         "caption_end": None if shot.get("caption_end") is None else float(shot["caption_end"]),
                         "transition": shot.get("transition") if shot.get("transition") in TRANSITIONS else "cut"})
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


def _video_filter(width: int, height: int, fps: int = FPS) -> str:
    return (f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps={fps},format=yuv420p")


def encode_args(fps: int = FPS) -> list[str]:
    return ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-r", str(fps),
            "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"]


ENCODE = encode_args()
SILENCE = ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]


FONT_PATHS = ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf")


def caption_image(text: str, size: tuple[int, int], out: str) -> str:
    """A transparent full-frame PNG with the caption on a dark band near the bottom."""
    from PIL import Image, ImageDraw, ImageFont

    width, height = size
    font_size = max(14, int(min(width, height) * 0.05))
    font_path = next((p for p in FONT_PATHS if os.path.exists(p)), None)
    font = ImageFont.truetype(font_path, font_size) if font_path else ImageFont.load_default(size=font_size)
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    lines, line = [], ""
    for word in text.split():
        candidate = f"{line} {word}".strip()
        if draw.textlength(candidate, font=font) <= width * 0.84 or not line:
            line = candidate
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    lines = lines[:3]
    gap = int(font_size * 0.3)
    heights = [draw.textbbox((0, 0), ln, font=font)[3] for ln in lines]
    block = sum(heights) + gap * (len(lines) - 1)
    pad = int(font_size * 0.45)
    top = height - int(height * 0.08) - block
    box_width = max(draw.textlength(ln, font=font) for ln in lines)
    draw.rounded_rectangle([(width - box_width) / 2 - pad, top - pad, (width + box_width) / 2 + pad, top + block + pad],
                           radius=pad, fill=(0, 0, 0, 150))
    y = top
    for ln, h in zip(lines, heights):
        draw.text(((width - draw.textlength(ln, font=font)) / 2, y), ln, font=font, fill=(255, 255, 255, 255))
        y += h + gap
    image.save(out)
    return out


def normalise(source: str, kind: str, duration: float, out: str, size: tuple[int, int], *,
              trim_start: float = 0.0, trim_end: float = 0.0, caption: Optional[str] = None,
              caption_window: Optional[tuple[float, Optional[float]]] = None, fps: int = FPS) -> None:
    """Re-encode one segment so every segment shares codec, size, fps and audio layout. A clip is cut by
    trim_start / trim_end seconds (always keeping at least a second of it); a caption image is laid on top."""
    vf = _video_filter(*size, fps)
    inputs: list[str]
    if kind == "frame":
        inputs = ["-loop", "1", "-t", f"{duration:.3f}", "-i", source]
        audio, tail = None, ["-t", f"{duration:.3f}"]
    else:
        cut: list[str] = []
        if trim_start or trim_end:
            length = duration_of(source)
            start = min(trim_start, max(0.0, length - 1.0))
            keep = max(1.0, length - start - trim_end) if length else 0.0
            cut = ["-ss", f"{start:.3f}", *(["-t", f"{keep:.3f}"] if keep else [])]
        inputs = [*cut, "-i", source]
        audio, tail = ("0:a", []) if has_audio(source) else (None, ["-shortest"])
    if audio is None:
        inputs += SILENCE
        audio = "1:a"
    if caption:
        overlay = len([a for a in inputs if a == "-i"])
        inputs += ["-loop", "1", "-i", caption]
        start, end = caption_window or (0.0, None)
        enable = f":enable='between(t,{start:.2f},{end:.2f})'" if end is not None else (f":enable='gte(t,{start:.2f})'" if start else "")
        video = ["-filter_complex", f"[0:v]{vf}[base];[base][{overlay}:v]overlay=0:0:shortest=1{enable},format=yuv420p[v]", "-map", "[v]"]
    else:
        video = ["-vf", vf, "-map", "0:v"]
    _run(["-y", *inputs, *video, "-map", audio, *tail, *encode_args(fps), out])


# How a shot comes in after the previous one: a cut, a fade through black, or a dissolve (cross-fade).
TRANSITIONS = ("cut", "fade", "dissolve")
TRANSITION_SECONDS = 0.5
XFADE = {"fade": "fadeblack", "dissolve": "fade"}


def transition_seconds(kind: str, before: float, after: float) -> float:
    """How long the transition into a shot overlaps the previous one (never more than a third of either clip)."""
    if kind not in XFADE:
        return 0.0
    return round(max(0.0, min(TRANSITION_SECONDS, before / 3, after / 3)), 3)


def join_with_transitions(parts: list[str], lengths: list[float], kinds: list[str], out: str, fps: int = FPS) -> list[float]:
    """Join normalised parts, with xfade / acrossfade where a shot has a transition (re-encoded); returns where each
    part starts in the result. Without transitions this is the plain lossless join."""
    overlaps = [0.0] + [transition_seconds(kinds[i], lengths[i - 1], lengths[i]) for i in range(1, len(parts))]
    starts, cursor = [], 0.0
    for index, length in enumerate(lengths):
        cursor -= overlaps[index]
        starts.append(round(cursor, 3))
        cursor += length
    if not any(overlaps):
        join(parts, out)
        return starts
    inputs, chains = [], []
    for part in parts:
        inputs += ["-i", part]
    video, audio = "[0:v]", "[0:a]"
    for index in range(1, len(parts)):
        v_out, a_out = f"[v{index}]", f"[a{index}]"
        if overlaps[index]:
            chains.append(f"{video}[{index}:v]xfade=transition={XFADE[kinds[index]]}:duration={overlaps[index]}:"
                          f"offset={starts[index]}{v_out}")
            chains.append(f"{audio}[{index}:a]acrossfade=d={overlaps[index]}{a_out}")
        else:
            chains.append(f"{video}[{index}:v]concat=n=2:v=1:a=0{v_out}")
            chains.append(f"{audio}[{index}:a]concat=n=2:v=0:a=1{a_out}")
        video, audio = v_out, a_out
    _run(["-y", *inputs, "-filter_complex", ";".join(chains), "-map", video, "-map", audio, *encode_args(fps),
          "-movflags", "+faststart", out])
    return starts


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
    """Finished voiceover / music assets, by "voiceover" / "music". Only what the board still has: a music bed or
    narration removed from the timeline keeps its file (re-adding it costs nothing) but is left out of the render."""
    tracks = {}
    audio = board.get("audio") or {}
    for name in ("voiceover", "music"):
        text = (audio.get(name) or {}).get("text" if name == "voiceover" else "prompt") or ""
        if not text.strip():
            continue
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


def _cut(trim_start: float, keep: Optional[float]) -> str:
    """atrim + timestamp reset for a part of a clip (keep=None: to its end)."""
    if not trim_start and keep is None:
        return ""
    end = f":duration={keep:.3f}" if keep is not None else ""
    return f"atrim=start={trim_start:.3f}{end},asetpts=PTS-STARTPTS,"


def mix(video: str, out: str, *, voices: Optional[list[tuple]] = None, music: Optional[str] = None,
        music_window: Optional[dict[str, Any]] = None) -> None:
    """Lay voice clips and the music bed over the joined video; the video's length wins.

    voices: (path, start second, trim_start, trim_end) — the clip's first and last seconds can be cut.
    music_window: {"start": second it starts in the video, "trim_start": seconds cut from the track,
    "end": second it stops (None: the end)}; it fades out over its last seconds."""
    length = duration_of(video)
    voices = voices or []
    inputs, chains, labels = ["-i", video], [], []
    voiced = "with_voice" if voices else "alone"
    chains.append(f"[0:a]volume={CLIP_VOLUME[voiced]}[clips]")
    labels.append("[clips]")
    for index, voice in enumerate(voices):
        path, start = voice[0], voice[1]
        trim_start, trim_end = (voice[2], voice[3]) if len(voice) > 3 else (0.0, 0.0)
        keep = max(0.1, duration_of(path) - trim_start - trim_end) if trim_end else None
        inputs += ["-i", path]
        delay = int(round(max(0.0, start) * 1000))
        chains.append(f"[{len(labels)}:a]{_cut(trim_start, keep)}aresample=48000,adelay={delay}:all=1,apad[vo{index}]")
        labels.append(f"[vo{index}]")
    if music:
        window = music_window or {}
        start = max(0.0, float(window.get("start") or 0))
        end = min(length, float(window["end"])) if window.get("end") is not None else length
        span = max(0.5, end - start)
        inputs += ["-i", music]
        fade_at = max(0.0, span - MUSIC_FADE_SECONDS)
        chains.append(f"[{len(labels)}:a]{_cut(float(window.get('trim_start') or 0), span) or f'atrim=duration={span:.3f},'}"
                      f"aresample=48000,volume={MUSIC_VOLUME[voiced]},"
                      f"afade=t=out:st={fade_at:.2f}:d={MUSIC_FADE_SECONDS},adelay={int(round(start * 1000))}:all=1,apad[music]")
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


def export_options(board: dict[str, Any], options: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """The Export dialog's choices (resolution, frames per second, container), defaulting to the brief."""
    from director_service.board import RESOLUTIONS

    options = options or {}
    resolution = options.get("resolution") or board["brief"].get("resolution") or "720p"
    fps = int(options.get("fps") or FPS)
    fmt = str(options.get("format") or "mp4").lower()
    if resolution not in RESOLUTIONS:
        raise RenderError(f"resolusi harus salah satu dari {', '.join(RESOLUTIONS)}")
    if fps not in EXPORT_FPS:
        raise RenderError(f"fps harus salah satu dari {', '.join(map(str, EXPORT_FPS))}")
    if fmt not in EXPORT_FORMATS:
        raise RenderError("format harus mp4 atau mov")
    return {"resolution": resolution, "fps": fps, "format": fmt}


def create(project_id: str, options: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    board = read_board(project_id)
    chosen = export_options(board, options)
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
        "resolution": chosen["resolution"], "fps": chosen["fps"], "format": chosen["format"],
    }

    def change(b: dict[str, Any]) -> None:
        b["renders"] = [*b["renders"], item][-20:]  # keep the latest renders only

    update_board(project_id, change)
    return item


KEEP_RENDERS = 3  # final videos kept per project; older files are removed from storage


def prune(project_id: str, remove: Callable[[str], Any]) -> int:
    """Remove the files of all but the latest KEEP_RENDERS finished renders (each export makes a new MP4)."""
    board = read_board(project_id)
    done = [r for r in board["renders"] if r.get("status") == "done" and r.get("asset_id")]
    removed = 0
    for old in done[:-KEEP_RENDERS]:
        try:
            remove(old["asset_id"])
        except Exception:  # noqa: BLE001 - kept for the next export to retry
            continue
        _set(project_id, old["id"], asset_id=None, deleted=True)
        removed += 1
    return removed


def run(project_id: str, render_id: str, *, download: Optional[Callable[[str], tuple[bytes, str]]] = None,
        upload: Optional[Callable[[bytes, str], str]] = None, remove: Optional[Callable[[str], Any]] = None) -> dict[str, Any]:
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
        remove = remove or bridge.delete_render

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
            caption = None
            if seg.get("caption"):
                caption = caption_image(seg["caption"], size, os.path.join(tmp, f"caption_{index}.png"))
            normalise(raw, seg["source"], seg["duration"], part, size, fps=int(item.get("fps") or FPS),
                      trim_start=seg.get("trim_start", 0.0), trim_end=seg.get("trim_end", 0.0), caption=caption,
                      caption_window=(seg.get("caption_start") or 0.0, seg.get("caption_end")))
            parts.append(part)
            length = round(duration_of(part), 3)
            placed.append({"shot_id": seg["shot_id"], "source": seg["source"], "start": round(cursor, 3), "duration": length})
            cursor += length
            _set(project_id, render_id, progress={"done": index + 1, "total": len(segments)})
        fmt = item.get("format") or "mp4"
        out = os.path.join(tmp, f"final.{fmt}")
        # Transitions overlap shots, so the parts are joined first and every shot's start (for VO, music and the
        # timeline) comes from the join.
        joined = os.path.join(tmp, f"joined.{fmt}")
        starts_at = join_with_transitions(parts, [p["duration"] for p in placed], [s.get("transition", "cut") for s in segments],
                                          joined, fps=int(item.get("fps") or FPS))
        for p, start in zip(placed, starts_at):
            p["start"] = start
        tracks = {name: asset for name, asset in audio_tracks(board).items() if name in item.get("audio", [])}
        starts = {p["shot_id"]: p["start"] for p in placed}
        offsets = {s["id"]: float(s.get("vo_offset") or 0) for s in board["shots"]}
        lines = {sid: asset for sid, asset in voice_lines(board).items() if sid in starts}
        if tracks or lines:
            def fetch(asset_id: str, name: str) -> str:
                content, _ = download(asset_id)
                path = os.path.join(tmp, f"{name}.mp3")
                with open(path, "wb") as fh:
                    fh.write(content)
                return path

            shots = {s["id"]: s for s in board["shots"]}
            voices = [(fetch(asset, f"vo_{sid}"), starts[sid] + offsets.get(sid, 0.0),
                       float(shots[sid].get("vo_trim_start") or 0), float(shots[sid].get("vo_trim_end") or 0))
                      for sid, asset in lines.items()]
            if "voiceover" in tracks:  # the older single narration, read from the start
                voices.append((fetch(tracks["voiceover"], "voiceover"), 0.0))
            music = fetch(tracks["music"], "music") if "music" in tracks else None
            mix(joined, out, voices=voices, music=music, music_window=(board.get("audio") or {}).get("music"))
        else:
            os.replace(joined, out)
        total_seconds = round(duration_of(out), 2)
        with open(out, "rb") as fh:
            data = fh.read()
    if len(data) > MAX_BYTES:
        raise RenderError(f"hasil render {len(data) // (1024 * 1024)} MB, melebihi batas 200 MB; coba resolusi lebih kecil")
    title = re.sub(r"[^A-Za-z0-9 _-]+", "", (board["script"] or {}).get("title") or project_id).strip() or "director"
    asset_id = upload(data, f"{title[:60]}.{item.get('format') or 'mp4'}")
    _set(project_id, render_id, status="done", asset_id=asset_id, size_bytes=len(data), duration_seconds=total_seconds,
         segments=placed,
         width=size[0], height=size[1], finished_at=now_iso())
    if remove is not None:
        prune(project_id, remove)
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
