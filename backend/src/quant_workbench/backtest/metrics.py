"""Report metrics for a finished backtest run.

Ratios are returned as decimals (0.12 = 12%) and the API layer formats them; a
metric that cannot be computed honestly returns None rather than 0, so "no sample"
never looks like "zero return".
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Sequence

from .engine import Trade

SESSIONS_PER_YEAR = 252
MIN_SESSIONS_FOR_ANNUAL = 20


@dataclass(frozen=True, slots=True)
class Metrics:
    total_return: Decimal | None
    annual_return: Decimal | None
    max_drawdown: Decimal | None
    sessions: int
    trades: int
    win_rate: Decimal | None
    fees: Decimal
    benchmark_return: Decimal | None
    excess_return: Decimal | None


def compute_metrics(
    equity: Sequence[tuple[date, Decimal]],
    trades: Sequence[Trade],
    *,
    benchmark: Sequence[Decimal] | None = None,
) -> Metrics:
    """Summarize a run; `benchmark` is a normalized series aligned to `equity`."""
    values = [value for _, value in equity]
    start_value = values[0] if values else Decimal("0")
    total = _ratio(values[-1], start_value) if len(values) >= 2 else None
    annual = (
        _annualize(total, len(values))
        if total is not None and len(values) >= MIN_SESSIONS_FOR_ANNUAL
        else None
    )
    bench = None
    if benchmark is not None and len(benchmark) >= 2 and benchmark[0] != 0:
        bench = _ratio(benchmark[-1], benchmark[0])
    excess = total - bench if total is not None and bench is not None else None
    wins = sum(1 for trade in trades if trade.pnl > 0)
    return Metrics(
        total_return=total,
        annual_return=annual,
        max_drawdown=max_drawdown(values),
        sessions=len(values),
        trades=len(trades),
        win_rate=Decimal(wins) / Decimal(len(trades)) if trades else None,
        fees=sum((trade.fees for trade in trades), Decimal("0")),
        benchmark_return=bench,
        excess_return=excess,
    )


def max_drawdown(values: Sequence[Decimal]) -> Decimal | None:
    """Deepest peak-to-trough fall, returned as a negative decimal."""
    if len(values) < 2:
        return None
    peak = values[0]
    worst = Decimal("0")
    for value in values:
        if value > peak:
            peak = value
        if peak > 0:
            fall = (value - peak) / peak
            worst = min(worst, fall)
    return worst


def _ratio(latest: Decimal, first: Decimal) -> Decimal | None:
    if first <= 0:
        return None
    return latest / first - 1


def _annualize(total: Decimal, sessions: int) -> Decimal | None:
    """Geometric annualization over the measured session count."""
    growth = 1 + total
    if growth <= 0:
        return None
    return growth ** (Decimal(SESSIONS_PER_YEAR) / Decimal(sessions)) - 1
