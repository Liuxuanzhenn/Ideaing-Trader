"""User lists (watchlist and basket) kept in one small JSON file.

They live outside `ingest.duckdb` on purpose: that file is opened read-only by every
request and is rewritten by the ingest jobs, so user writes there would mean fighting
a lock with a batch job. A JSON file also keeps this module free of any database
dependency, which matters because the data volume here is a few dozen symbols.

Writes go through a unique temp file in the same directory, are fsynced, and are then
published with `os.replace` - an interrupted write cannot leave a half-written list
behind, a failed replace leaves the previous file untouched, and the temp file is always
removed. Read-modify-write is serialised per path, otherwise two concurrent adds both
read the old state and the later write silently drops the first one.

shortcut: the serialisation is in-process only (one uvicorn worker writes this file);
upgrade to a file lock if the API is ever run with several writers.
"""

from __future__ import annotations

import json
import os
import tempfile
import threading
from pathlib import Path

DEFAULT_PATH = os.environ.get("QW_PORTFOLIO_PATH", "data/portfolio.json")
KINDS = ("watchlist", "basket")


_LOCKS: dict[str, threading.Lock] = {}
_LOCKS_GUARD = threading.Lock()


def _lock_for(path: Path) -> threading.Lock:
    """One lock per file, shared by every store pointing at the same path."""
    key = os.path.abspath(path)
    with _LOCKS_GUARD:
        return _LOCKS.setdefault(key, threading.Lock())


class PortfolioStore:
    def __init__(self, path: str | Path = DEFAULT_PATH) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = _lock_for(self.path)

    def list(self) -> dict[str, list[str]]:
        return self._read()

    def add(self, kind: str, symbol: str) -> dict[str, list[str]]:
        _require_kind(kind)
        with self._lock:
            state = self._read()
            if symbol not in state[kind]:
                # Adding twice is a silent no-op: the UI disables the button, and an
                # error here would be a 500 for something the user cannot cause.
                state[kind].append(symbol)
                self._write(state)
            return state

    def remove(self, kind: str, symbol: str) -> dict[str, list[str]]:
        _require_kind(kind)
        with self._lock:
            state = self._read()
            if symbol in state[kind]:
                state[kind] = [item for item in state[kind] if item != symbol]
                self._write(state)
            return state

    def _read(self) -> dict[str, list[str]]:
        if not self.path.exists():
            return {kind: [] for kind in KINDS}
        try:
            stored = json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as error:
            # A corrupt file is reported, never silently reset: the user would otherwise
            # see an empty watchlist and assume the entries were lost on purpose.
            raise ValueError(f"portfolio file is unreadable: {self.path}: {error}") from error
        return {kind: [str(item) for item in stored.get(kind, [])] for kind in KINDS}

    def _write(self, state: dict[str, list[str]]) -> None:
        # A unique name per write: two writers can never share (and clobber) one temp.
        handle, temp = tempfile.mkstemp(
            dir=str(self.path.parent), prefix=f".{self.path.name}.", suffix=".tmp"
        )
        try:
            with os.fdopen(handle, "w", encoding="utf-8") as stream:
                stream.write(json.dumps(state, ensure_ascii=False, indent=2))
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temp, self.path)
        except BaseException:
            # The previous file is still intact because replace never ran; drop the temp
            # so a failed write cannot accumulate junk next to the portfolio.
            try:
                os.unlink(temp)
            except OSError:
                pass
            raise


def _require_kind(kind: str) -> None:
    if kind not in KINDS:
        raise ValueError(f"unknown list: {kind}")
