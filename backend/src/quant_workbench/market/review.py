"""Daily market aggregates computed from canonical daily bars.

Every function takes bars for a single trade date. Suspended bars are excluded
from breadth and limit statistics, and a day with no price limit is counted
separately so a ratio is never silently distorted by new listings.

`high` is the only intraday signal we have, so "touched the limit" is an
approximation: a stock that hit the limit price and closed below it is treated as
a failed seal. Bars with `trading=False` are never counted.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable, Sequence

from quant_workbench.data import DailyBar

from .limits import board_from_symbol, is_st_effective, limit_prices, limit_ratio

SEALED_UP = "sealed_up"
BROKEN_UP = "broken_up"
SEALED_DOWN = "sealed_down"
NO_LIMIT = "no_limit"
OUT_OF_BAND = "out_of_band"
ORDINARY = "ordinary"
NOT_TRADED = "not_traded"


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
    out_of_band: int = 0

    @property
    def touched_up(self) -> int:
        """Stocks that reached the upper limit at any point in the day."""
        return self.sealed_up + self.broken_up

    @property
    def seal_rate(self) -> float | None:
        """Share of limit-up attempts that closed sealed; None when no attempts."""
        return self.sealed_up / self.touched_up if self.touched_up else None


def classify_bar(bar: DailyBar, *, new_listing_window: bool = False) -> str:
    """Place one bar into a limit state; never guesses when data is unusable."""
    if not bar.trading or bar.preclose is None:
        return NOT_TRADED
    ratio = limit_ratio(
        board_from_symbol(bar.symbol),
        is_st_effective(bar),
        bar.trade_date,
        new_listing_window=new_listing_window,
    )
    prices = limit_prices(bar.preclose, ratio)
    if prices is None:
        return NO_LIMIT
    upper, lower = prices
    if bar.high > upper or bar.low < lower:
        return OUT_OF_BAND
    if bar.close >= upper:
        return SEALED_UP
    if bar.high >= upper:
        return BROKEN_UP
    if bar.close <= lower:
        return SEALED_DOWN
    return ORDINARY


def breadth(bars: Iterable[DailyBar]) -> Breadth:
    """Count advancing, declining and unchanged stocks among traded bars."""
    up = down = flat = 0
    for bar in bars:
        if not bar.trading or bar.preclose is None:
            continue
        if bar.close > bar.preclose:
            up += 1
        elif bar.close < bar.preclose:
            down += 1
        else:
            flat += 1
    return Breadth(up=up, down=down, flat=flat)


def limit_stats(bars: Iterable[DailyBar], *, new_listing_symbols: frozenset[str] = frozenset()) -> LimitStats:
    counts = {SEALED_UP: 0, BROKEN_UP: 0, SEALED_DOWN: 0, NO_LIMIT: 0, OUT_OF_BAND: 0}
    for bar in bars:
        state = classify_bar(bar, new_listing_window=bar.symbol in new_listing_symbols)
        if state in counts:
            counts[state] += 1
    return LimitStats(
        sealed_up=counts[SEALED_UP],
        broken_up=counts[BROKEN_UP],
        sealed_down=counts[SEALED_DOWN],
        no_limit=counts[NO_LIMIT],
        out_of_band=counts[OUT_OF_BAND],
    )


def limit_up_streak(bars: Sequence[DailyBar], *, new_listing_symbols: frozenset[str] = frozenset()) -> int:
    """Trailing consecutive sealed limit-up sessions for one symbol.

    `bars` must be that symbol's history sorted by trade date ending on the date
    of interest. Suspended days end the streak rather than being skipped.
    """
    streak = 0
    for bar in reversed(bars):
        state = classify_bar(bar, new_listing_window=bar.symbol in new_listing_symbols)
        if state != SEALED_UP:
            break
        streak += 1
    return streak


def limit_up_ladder(
    histories: Iterable[Sequence[DailyBar]], *, new_listing_symbols: frozenset[str] = frozenset()
) -> dict[int, int]:
    """Count how many symbols sit at each consecutive limit-up streak length."""
    ladder: dict[int, int] = {}
    for history in histories:
        streak = limit_up_streak(history, new_listing_symbols=new_listing_symbols)
        if streak:
            ladder[streak] = ladder.get(streak, 0) + 1
    return dict(sorted(ladder.items(), reverse=True))


@dataclass(frozen=True, slots=True)
class LowOpenHighClose:
    """低开高走 sample: opened at least `gap` below the prior close and closed up."""

    hits: int
    samples: int
    gap: Decimal

    @property
    def rate(self) -> float | None:
        return self.hits / self.samples if self.samples else None


def low_open_high_close(bars: Iterable[DailyBar], *, gap: Decimal = Decimal("0.002")) -> LowOpenHighClose:
    """Count gaps down that closed above the open, with the denominator attached.

    `gap` is the minimum open-vs-preclose drop; the definition is still pending
    confirmation, so callers pass it explicitly instead of relying on a default.
    """
    if gap <= 0:
        raise ValueError("gap must be positive")
    hits = samples = 0
    for bar in bars:
        if not bar.trading or bar.preclose is None or bar.preclose <= 0:
            continue
        if bar.open > bar.preclose * (1 - gap):
            continue
        samples += 1
        if bar.close > bar.open:
            hits += 1
    return LowOpenHighClose(hits=hits, samples=samples, gap=gap)
