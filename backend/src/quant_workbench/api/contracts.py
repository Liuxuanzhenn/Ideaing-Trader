"""Wire format for the review endpoint, frozen for the first vertical slice.

Conventions shared with the frontend type definitions:
- money in yuan, share counts in shares, never pre-scaled
- a field ending in `_pct` holds 0-100, a `_rate` field holds 0-1
- a value that cannot be computed is None, never 0, so "no sample" is not read as
  "zero" by a chart or a user

These dataclasses are serialized by the API layer; nothing here touches storage.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime

OK = "ok"
PARTIAL = "partial"
STALE = "stale"
ERROR = "error"
EMPTY = "empty"


@dataclass(frozen=True, slots=True)
class Coverage:
    """How much of the expected universe actually reported for this session."""

    instruments: int
    expected: int

    @property
    def pct(self) -> float | None:
        return 100.0 * self.instruments / self.expected if self.expected else None


@dataclass(frozen=True, slots=True)
class DataMeta:
    as_of: date
    updated_at: datetime
    snapshot_id: str
    level: str
    failed_sources: tuple[str, ...] = ()
    coverage: Coverage | None = None

    def __post_init__(self) -> None:
        if self.level not in (OK, PARTIAL, STALE, ERROR, EMPTY):
            raise ValueError(f"unknown data status level: {self.level}")


@dataclass(frozen=True, slots=True)
class IndexQuote:
    code: str
    name: str
    close: float
    chg_pct: float
    amount: float


@dataclass(frozen=True, slots=True)
class Breadth:
    up: int
    down: int
    flat: int

    @property
    def total(self) -> int:
        return self.up + self.down + self.flat


@dataclass(frozen=True, slots=True)
class LimitStats:
    sealed_up: int
    broken_up: int
    sealed_down: int
    no_limit: int

    @property
    def touched_up(self) -> int:
        return self.sealed_up + self.broken_up

    @property
    def seal_rate(self) -> float | None:
        """Sealed share of limit-up attempts; None when nothing reached the limit."""
        return self.sealed_up / self.touched_up if self.touched_up else None


@dataclass(frozen=True, slots=True)
class LadderEntry:
    symbol: str
    name: str
    streak: int


@dataclass(frozen=True, slots=True)
class Review:
    meta: DataMeta
    is_trading_day: bool
    breadth: Breadth
    limits: LimitStats
    ladder: tuple[LadderEntry, ...] = ()
    indices: tuple[IndexQuote, ...] = ()
    excluded: dict[str, int] = field(default_factory=dict)
    """Why rows were dropped, e.g. {"suspended": 42, "st": 130}."""
