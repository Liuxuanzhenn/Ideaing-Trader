"""Adjustment factors derived from a raw and an adjusted close series.

Sources such as baostock publish adjusted prices rather than factors, so the
factor is the ratio between the two series. Nothing here guesses a factor: a
series that cannot be paired day for day is rejected instead of being aligned by
position, because a silent misalignment corrupts every later return.
"""

from __future__ import annotations

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


def normalize_to_latest(factors: Sequence[Decimal]) -> tuple[Decimal, ...]:
    """Rescale factors so the last session is 1.0, matching forward adjustment."""
    if not factors:
        raise ValueError("cannot normalize an empty factor series")
    latest = factors[-1]
    if latest <= 0:
        raise ValueError("latest factor must be positive")
    return tuple(factor / latest for factor in factors)
