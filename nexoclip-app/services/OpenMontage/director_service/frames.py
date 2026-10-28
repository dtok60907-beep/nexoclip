"""Stills sampled from a video, for a model that reads images but not video (Grok watches an attached video this way)."""

from __future__ import annotations

import re
import subprocess
import tempfile
from pathlib import Path

from director_service.render import ffmpeg_exe

MAX_FRAMES = 24  # a long video is sampled more sparsely, never more stills than this
FRAME_SIDE = 512
TIMEOUT_SECONDS = 120

_DURATION = re.compile(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)")


class FramesError(RuntimeError):
    pass


def sample(content: bytes) -> list[tuple[float, bytes]]:
    """(seconds into the video, JPEG) for evenly spaced stills: one a second, or MAX_FRAMES across a longer video."""
    with tempfile.TemporaryDirectory(prefix="director-frames-") as tmp:
        source = Path(tmp) / "video"
        source.write_bytes(content)
        probe = _ffmpeg(["-i", str(source)], check=False)  # no output given: ffmpeg only prints what the input is
        found = _DURATION.search(probe)
        if not found:
            raise FramesError("could not read the video's length")
        duration = int(found.group(1)) * 3600 + int(found.group(2)) * 60 + float(found.group(3))
        step = max(1.0, duration / MAX_FRAMES)
        _ffmpeg(["-i", str(source), "-vf", f"fps=1/{step:.3f},scale='min({FRAME_SIDE},iw)':-2", "-frames:v", str(MAX_FRAMES),
                 "-q:v", "4", str(Path(tmp) / "f%03d.jpg")])
        stills = sorted(Path(tmp).glob("f*.jpg"))
        if not stills:
            raise FramesError("no frames could be read from the video")
        # The fps filter puts frame n at n * step (the first at 0 s).
        return [(round(min(n * step, duration), 1), still.read_bytes()) for n, still in enumerate(stills)]


def _ffmpeg(args: list[str], *, check: bool = True) -> str:
    try:
        done = subprocess.run([ffmpeg_exe(), "-hide_banner", "-nostdin", *args], capture_output=True, text=True,
                              timeout=TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired as exc:
        raise FramesError("ffmpeg timed out reading the video") from exc
    if check and done.returncode != 0:
        raise FramesError("ffmpeg could not read the video: " + " | ".join(done.stderr.strip().splitlines()[-2:])[:300])
    return done.stderr
