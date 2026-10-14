"""Download Assets: everything a project made, in one ZIP.

Reference sheets, each shot's frame and active video, voiceover lines, music and the latest final video, named so
they sort in timeline order. Free: the files are the user's own nexoclip assets, fetched through the bridge.
"""

from __future__ import annotations

import re
import tempfile
import zipfile
from typing import Any, Callable, Optional

from director_service import billing
from director_service.board import TERMINAL_OK, read_board
from director_service.render import ordered_shots

EXTENSIONS = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov",
              "audio/mpeg": "mp3", "audio/wav": "wav"}


def _safe(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "-", text or "").strip("-")[:40] or "item"


def asset_list(board: dict[str, Any]) -> list[tuple[str, str]]:
    """(name without extension, asset id) for every finished media of the project, in a useful order."""
    media = board["media"]

    def ready(key: str) -> Optional[str]:
        item = media.get(key) or {}
        return item.get("asset_id") if item.get("status") == TERMINAL_OK else None

    files: list[tuple[str, str]] = []
    for element in board["elements"]:
        if (asset := ready(f"element:{element['id']}")):
            files.append((f"aset/{element['kind']}-{_safe(element['name'])}", asset))
    for number, shot in enumerate(ordered_shots(board), start=1):
        base = f"shot/{number:02d}-{_safe(shot.get('title') or shot['id'])}"
        for key, suffix in ((f"frame:{shot['id']}", "gambar"), (f"video:{shot['id']}", "video"), (f"vo:{shot['id']}", "vo")):
            if (asset := ready(key)):
                files.append((f"{base}-{suffix}", asset))
    for key, name in (("audio:music", "audio/musik"), ("audio:voiceover", "audio/voiceover")):
        if (asset := ready(key)):
            files.append((name, asset))
    done = [r for r in board.get("renders") or [] if r.get("status") == "done" and r.get("asset_id")]
    if done:
        files.append(("video-final", done[-1]["asset_id"]))
    return files


def build_zip(project_id: str, *, download: Optional[Callable[[str], Any]] = None) -> tuple[Any, int]:
    """Write the project's assets into a temporary ZIP; returns (open file positioned at 0, number of files)."""
    board = read_board(project_id)
    files = asset_list(board)
    if not files:
        raise ValueError("belum ada gambar, video atau audio yang jadi untuk diunduh")
    if download is None:
        bridge = billing.bridge_for(project_id)
        if bridge is None:
            raise ValueError("unduh aset butuh koneksi ke nexoclip")
        download = bridge.download
    out = tempfile.SpooledTemporaryFile(max_size=64 * 1024 * 1024)
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_STORED) as archive:  # media is already compressed
        for name, asset_id in files:
            fetched = download(asset_id)
            ext = EXTENSIONS.get((fetched.content_type or "").split(";")[0].strip(), "bin")
            archive.writestr(f"{name}.{ext}", fetched.content)
    out.seek(0)
    return out, len(files)
