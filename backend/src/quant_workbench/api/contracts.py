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
    """Limit states for one session; derived counts are materialized for the wire."""

    sealed_up: int
    broken_up: int
    sealed_down: int
    no_limit: int
    out_of_band: int = 0
    touched_up: int = 0
    seal_rate: float | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "touched_up", self.sealed_up + self.broken_up)
        rate = self.sealed_up / self.touched_up if self.touched_up else None
        object.__setattr__(self, "seal_rate", rate)


@dataclass(frozen=True, slots=True)
class LadderEntry:
    symbol: str
    streak: int
    is_one_word: bool
    name: str | None = None
    """Instrument names are not stored yet; the UI falls back to the code."""


@dataclass(frozen=True, slots=True)
class ScreenRow:
    """One match. `name`, `industry` and `mcap` stay None: the database has no such columns."""

    code: str
    name: str | None
    price: float
    chg_pct: float
    turnover_pct: float | None
    amount: float
    ladder: int
    limit_20: int
    industry: str | None = None
    mcap: float | None = None


@dataclass(frozen=True, slots=True)
class ScreenResult:
    meta: DataMeta
    rows: tuple[ScreenRow, ...]
    excluded: dict[str, int] = field(default_factory=dict)
    """Rows removed before filtering, e.g. {"st": 170}."""


@dataclass(frozen=True, slots=True)
class ScreenOptions:
    meta: DataMeta
    unavailable: tuple[str, ...] = ()
    """Fields the database cannot answer; the UI must disable them, not ignore them."""


@dataclass(frozen=True, slots=True)
class SessionPoint:
    """One day of market-wide aggregates, straight from the precomputed table."""

    trade_date: date
    up: int
    down: int
    flat: int
    sealed_up: int
    broken_up: int
    sealed_down: int
    touched_up: int
    seal_rate: float | None
    max_ladder: int
    ladder_count: int
    amount: float


@dataclass(frozen=True, slots=True)
class IndexSeries:
    code: str
    name: str
    closes: tuple[float | None, ...]
    """Aligned with SessionSeries.dates; None where the index has no bar that day."""


@dataclass(frozen=True, slots=True)
class SessionSeries:
    """Trailing sessions for the sparklines; oldest first, ending on the review date."""

    dates: tuple[date, ...] = ()
    sealed_up: tuple[int, ...] = ()
    sealed_down: tuple[int, ...] = ()
    broken_up: tuple[int, ...] = ()
    seal_rate: tuple[float | None, ...] = ()
    red_ratio: tuple[float | None, ...] = ()
    max_ladder: tuple[int, ...] = ()
    ladder_count: tuple[int, ...] = ()
    amount: tuple[float, ...] = ()
    indices: tuple[IndexSeries, ...] = ()


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
    series: SessionSeries = field(default_factory=SessionSeries)


@dataclass(frozen=True, slots=True)
class Candle:
    """One session of prices in yuan and volume in shares, raw (not adjusted)."""

    trade_date: date
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass(frozen=True, slots=True)
class LowOpenStats:
    hits: int
    samples: int
    window: int
    version: str

    @property
    def rate(self) -> float | None:
        return self.hits / self.samples if self.samples else None


@dataclass(frozen=True, slots=True)
class StockStats:
    chg_20d_pct: float | None
    low_open: LowOpenStats
    limit_250: int
    max_ladder: int


@dataclass(frozen=True, slots=True)
class StockDetail:
    """One instrument as the UI needs it.

    Fields the database cannot supply yet (`name`, `industry`, `concepts`, `mcap`)
    stay None/empty on purpose: the page shows the code instead of inventing a label.
    """

    meta: DataMeta
    code: str
    name: str | None
    board: str
    trade_status: str
    price: float | None
    chg_pct: float | None
    turnover_pct: float | None
    amount: float | None
    mcap: float | None
    stats: StockStats
    candles: tuple[Candle, ...]
    price_adjustment: str
    industry: str | None = None
    concepts: tuple[str, ...] = ()
