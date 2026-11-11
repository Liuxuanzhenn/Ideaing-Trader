"""User lists (watchlist and basket) kept in one small JSON file.

They live outside `ingest.duckdb` on purpose: that file is opened read-only by every
request and is rewritten by the ingest jobs, so user writes there would mean fighting
a lock with a batch job. A JSON file also keeps this module free of any database
dependency, which matters because the data volume here is a few dozen symbols.

Writes go through a temp file and `os.replace` so an interrupted write cannot leave a
half-written list behind - losing a watchlist is annoying, reading a corrupt one is worse.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

DEFAULT_PATH = os.environ.get("QW_PORTFOLIO_PATH", "data/portfolio.json")
KINDS = ("watchlist", "basket")


class PortfolioStore:
    def __init__(self, path: str | Path = DEFAULT_PATH) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def list(self) -> dict[str, list[str]]:
        return self._read()

    def add(self, kind: str, symbol: str) -> dict[str, list[str]]:
        _require_kind(kind)
        state = self._read()
        if symbol not in state[kind]:
            # Adding twice is a silent no-op: the UI disables the button, and an error
            # here would be a 500 for something the user cannot cause.
            state[kind].append(symbol)
            self._write(state)
        return state

    def remove(self, kind: str, symbol: str) -> dict[str, list[str]]:
        _require_kind(kind)
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
        temp = self.path.with_suffix(".tmp")
        temp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(temp, self.path)


def _require_kind(kind: str) -> None:
    if kind not in KINDS:
        raise ValueError(f"unknown list: {kind}")
