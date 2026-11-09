"""Adjustment factors derived from a raw and an adjusted close series.

Sources such as baostock publish adjusted prices rather than factors, so the
factor is the ratio between the two series. Nothing here guesses a factor: a
series that cannot be paired day for day is rejected instead of being aligned by
position, because a silent misalignment corrupts every later return.
"""

from __future__ import annotations

from bisect import bisect_right
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Sequence


def derive_adjustment_factors(
    raw_closes: Sequence[Decimal],
    adjusted_closes: Sequence[Decimal],
) -> tuple[Decimal, ...]:
    """Per-session factor = adjusted / raw, in the order given."""
    if len(raw_closes) != len(adjusted_closes):
        raise ValueError(
            f"raw and adjusted series differ in length: {len(raw_closes)} vs {len(adjusted_closes)}"
        )
    if not raw_closes:
        raise ValueError("cannot derive factors from empty series")
    factors = []
    for index, (raw, adjusted) in enumerate(zip(raw_closes, adjusted_closes)):
        if raw <= 0 or adjusted <= 0:
            raise ValueError(f"non-positive close at index {index}: raw={raw}, adjusted={adjusted}")
        factors.append(adjusted / raw)
    return tuple(factors)


def apply_factors(prices: Sequence[Decimal], factors: Sequence[Decimal]) -> tuple[Decimal, ...]:
    """Scale prices by their per-session factor; returns the adjusted series."""
    if len(prices) != len(factors):
        raise ValueError(f"prices and factors differ in length: {len(prices)} vs {len(factors)}")
    adjusted = []
    for index, (price, factor) in enumerate(zip(prices, factors)):
        if price <= 0 or factor <= 0:
            raise ValueError(f"non-positive price or factor at index {index}")
        adjusted.append(price * factor)
    return tuple(adjusted)


def normalize_to_latest(factors: Sequence[Decimal]) -> tuple[Decimal, ...]:
    """Rescale factors so the last session is 1.0, matching forward adjustment."""
    if not factors:
        raise ValueError("cannot normalize an empty factor series")
    latest = factors[-1]
    if latest <= 0:
        raise ValueError("latest factor must be positive")
    return tuple(factor / latest for factor in factors)


@dataclass(frozen=True, slots=True)
class FactorChange:
    """A factor takes effect on `effect_date` and holds until the next change."""

    effect_date: date
    factor: Decimal

    def __post_init__(self) -> None:
        if self.factor <= 0:
            raise ValueError("factor must be positive")


def collapse_to_changes(
    dates: Sequence[date],
    factors: Sequence[Decimal],
) -> tuple[FactorChange, ...]:
    """Keep only the sessions where the factor actually changes.

    A factor moves only on ex-dividend and split dates, so storing change points
    instead of one row per session keeps the table small with no information loss.
    """
    if len(dates) != len(factors):
        raise ValueError(f"dates and factors differ in length: {len(dates)} vs {len(factors)}")
    changes: list[FactorChange] = []
    previous: Decimal | None = None
    for index, (day, factor) in enumerate(zip(dates, factors)):
        if index and day <= dates[index - 1]:
            raise ValueError(f"dates must be strictly ascending, got {day} after {dates[index - 1]}")
        if factor <= 0:
            raise ValueError(f"non-positive factor on {day}")
        if previous is None or factor != previous:
            changes.append(FactorChange(day, factor))
            previous = factor
    return tuple(changes)


def factor_on(changes: Sequence[FactorChange], day: date) -> Decimal | None:
    """Factor in force on `day`, or None when `day` precedes the first change."""
    if not changes:
        return None
    index = bisect_right([change.effect_date for change in changes], day) - 1
    return changes[index].factor if index >= 0 else None
