"""Demo video library for the operator console.

This module stores and serves clips. It does **not** analyse them: no detector,
tracker or model runs over an uploaded file anywhere in this process. The
console performs its own per-tile visibility and frame-difference checks in the
browser and labels them as such, and every crowd count it displays alongside a
clip remains the simulated timeline. Registering a video here never turns a
simulated reading into an observed one.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path

MAX_UPLOAD_BYTES = 200 * 1024 * 1024

# Extension -> media type. An upload is rejected unless its name ends in one of
# these, which keeps the store to things a browser can actually play back.
MEDIA_TYPES = {
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
}

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._ -]+")


@dataclass(frozen=True)
class VideoSource:
    source_id: str
    name: str
    origin: str  # "bundled" or "uploaded"
    size_bytes: int
    media_type: str
    modified_at: str

    def to_dict(self) -> dict:
        return {**asdict(self), "url": f"/api/sources/{self.source_id}/video"}


class VideoLibrary:
    """Clips available to the console: a read-only bundled set plus uploads."""

    def __init__(self, bundled_dir: Path, upload_dir: Path) -> None:
        self.bundled_dir = bundled_dir
        self.upload_dir = upload_dir
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    # -- listing ----------------------------------------------------------

    def list(self) -> list[dict]:
        sources = [
            *self._scan(self.bundled_dir, "bundled"),
            *self._scan(self.upload_dir, "uploaded"),
        ]
        sources.sort(key=lambda item: (item.origin != "bundled", item.name.lower()))
        return [item.to_dict() for item in sources]

    def _scan(self, directory: Path, origin: str) -> list[VideoSource]:
        if not directory.is_dir():
            return []
        found = []
        for path in sorted(directory.iterdir()):
            if not path.is_file() or path.suffix.lower() not in MEDIA_TYPES:
                continue
            stat = path.stat()
            found.append(
                VideoSource(
                    source_id=self._identify(origin, path.name),
                    name=path.name,
                    origin=origin,
                    size_bytes=stat.st_size,
                    media_type=MEDIA_TYPES[path.suffix.lower()],
                    modified_at=datetime.fromtimestamp(stat.st_mtime, timezone.utc)
                    .isoformat()
                    .replace("+00:00", "Z"),
                )
            )
        return found

    @staticmethod
    def _identify(origin: str, name: str) -> str:
        digest = hashlib.sha256(f"{origin}/{name}".encode("utf-8")).hexdigest()[:16]
        return f"{origin[:3]}-{digest}"

    # -- resolution -------------------------------------------------------

    def resolve(self, source_id: str) -> tuple[Path, VideoSource] | None:
        """Map an id back to a file, or None. Ids are matched against a fresh
        scan rather than parsed, so a crafted id can never escape either
        directory."""
        for origin, directory in (("bundled", self.bundled_dir), ("uploaded", self.upload_dir)):
            for source in self._scan(directory, origin):
                if source.source_id == source_id:
                    return directory / source.name, source
        return None

    # -- writes -----------------------------------------------------------

    def save(self, filename: str, payload: bytes) -> dict:
        """Store an uploaded clip. Raises ValueError on anything unacceptable."""
        if not payload:
            raise ValueError("Empty upload.")
        if len(payload) > MAX_UPLOAD_BYTES:
            raise ValueError(
                f"Video is larger than the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB demo limit."
            )

        safe = self._sanitize(filename)
        if Path(safe).suffix.lower() not in MEDIA_TYPES:
            allowed = ", ".join(sorted(MEDIA_TYPES))
            raise ValueError(f"Unsupported video type. Allowed extensions: {allowed}.")

        target = self.upload_dir / safe
        stem, suffix = Path(safe).stem, Path(safe).suffix
        serial = 1
        while target.exists():
            serial += 1
            target = self.upload_dir / f"{stem} ({serial}){suffix}"

        target.write_bytes(payload)
        resolved = self.resolve(self._identify("uploaded", target.name))
        if resolved is None:  # pragma: no cover - only if the file vanished
            raise ValueError("Upload could not be registered.")
        return resolved[1].to_dict()

    def delete(self, source_id: str) -> bool:
        """Remove an uploaded clip. Bundled samples are never deletable."""
        resolved = self.resolve(source_id)
        if resolved is None or resolved[1].origin != "uploaded":
            return False
        resolved[0].unlink(missing_ok=True)
        return True

    @staticmethod
    def _sanitize(filename: str) -> str:
        """Reduce a client-supplied name to a plain basename in this directory."""
        base = Path(unicodedata.normalize("NFKC", filename or "")).name
        base = _SAFE_NAME.sub("_", base).strip(" .")
        if not base:
            raise ValueError("Missing or unusable file name.")
        return base[:120]
