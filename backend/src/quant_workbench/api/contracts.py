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
class PromotionStep:
    """How many of yesterday's N-board stocks sealed again today."""

    level: int
    base: int
    promoted: int

    @property
    def rate(self) -> float | None:
        return self.promoted / self.base if self.base else None


@dataclass(frozen=True, slots=True)
class PrevLimitPerformance:
    """Yesterday's sealed limit-ups, measured on today's close."""

    samples: int
    median_pct: float | None
    up_ratio: float | None


@dataclass(frozen=True, slots=True)
class MarketExtra:
    amount: float | None
    """Total turnover in yuan; None when the session has no traded rows."""
    promotion: tuple[PromotionStep, ...] = ()
    prev_limit: PrevLimitPerformance | None = None


@dataclass(frozen=True, slots=True)
class BacktestParams:
    """Everything needed to reproduce the run; echoed back in the report."""

    strategy: str
    strategy_label: str
    start: date
    end: date
    capital: float
    max_positions: int
    holding_days: int


@dataclass(frozen=True, slots=True)
class BacktestTrade:
    symbol: str
    entry_date: date
    exit_date: date
    quantity: float
    entry_price: float
    exit_price: float
    fees: float
    pnl: float


@dataclass(frozen=True, slots=True)
class BacktestReport:
    meta: DataMeta
    params: BacktestParams
    starting_capital: float
    ending_equity: float
    equity: tuple[tuple[date, float], ...]
    benchmark: tuple[float, ...]
    """Benchmark rebased to 100 and aligned with `equity`; empty when no index bar."""
    benchmark_return: float | None
    trades: tuple[BacktestTrade, ...]
    skips: dict[str, int]
    total_return: float | None
    annual_return: float | None
    max_drawdown: float | None
    win_rate: float | None
    fees: float
    fee_schedule: dict[str, float] = field(default_factory=dict)
    note: str = ""


@dataclass(frozen=True, slots=True)
class ScreenRow:
    """One match.

    `name` and `industry` come from the optional instruments_meta file, `mcap` stays
    None: the database has no such column. `industry_status` is None whenever metadata
    is unavailable, so a missing file never reads as "the source has no record".
    """

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
    industry_status: str | None = None


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
    market: MarketExtra = field(default_factory=lambda: MarketExtra(amount=None))


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

    `name` and `industry` come from the optional instruments_meta file; `concepts` and
    `mcap` stay None on purpose. `industry_status` carries the loader status
    (ok / empty_for_delisted / missing / missing_basic) and is None when no metadata
    file is configured, so an absent file is never reported as an absent source record.

    `concepts` is None because no concept source is wired up at all. An empty tuple is
    reserved for "queried, and this stock really has no concepts", which nothing can
    claim yet.
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
    industry_status: str | None = None
    concepts: tuple[str, ...] | None = None
    boards: tuple["StockBoard", ...] | None = None
    """Membership only. None = board data not wired (or no row for this symbol)."""


@dataclass(frozen=True, slots=True)
class BoardRow:
    """One board's equal-weight performance for a session.

    `pct_chg_ew` is deliberately not called `pct_chg`: the official board change is
    market-cap weighted, so a same-named field would invite a wrong comparison.
    A board with no valid member that session is absent from the list, never 0%.
    """

    code: str
    name: str
    type: str
    pct_chg_ew: float | None
    up_count: int
    down_count: int
    flat_count: int
    leader_symbol: str | None
    leader_name: str | None
    member_count: int
    valid_count: int


@dataclass(frozen=True, slots=True)
class BoardList:
    """`meta` carries provenance, but /api/boards answers with a SLIM meta object
    ({as_of, updated_at, snapshot_id, status}) rather than a serialised `DataMeta`:
    the endpoint never needs level/failed_sources/coverage, and the frontend already
    consumes the flat `status` string. This is deliberate, not an inconsistency bug —
    do not "fix" it into a DataMeta shape without changing the frontend in the same PR.
    """

    meta: DataMeta
    rows: tuple[BoardRow, ...]
    status: str = "ok"
    """ok: rows carry data; empty: no aggregation for that date (or not wired yet)."""


@dataclass(frozen=True, slots=True)
class StockBoard:
    """A board the instrument belongs to. Membership only: no board performance here."""

    code: str
    name: str
    type: str


@dataclass(frozen=True, slots=True)
class DragonTigerRow:
    trade_id: str
    symbol: str | None
    secucode: str
    name: str | None
    market: str | None
    close: float | None
    chg_pct: float | None
    turnover_rate: float | None
    billboard_amt: float | None
    buy_amt: float | None
    sell_amt: float | None
    net_amt: float | None
    deal_amt_ratio: float | None
    free_mcap: float | None
    reason: str
    reason_text: str


@dataclass(frozen=True, slots=True)
class DragonTigerList:
    """Same slim-meta rule as BoardList: /api/dragon-tiger serialises
    {trade_date, total, excluded_bj, status, snapshot_id, updated_at}, not a DataMeta."""

    meta: DataMeta
    rows: tuple[DragonTigerRow, ...]
    status: str = "ok"
    excluded_bj: int = 0
    """Rows dropped by the default v1 filter. Reported, never silently discarded."""
