"""Runs one daily backtest over stored bars.

Scope for this version is deliberately narrow: the only strategy is "stocks that
sealed their first limit-up today get bought at tomorrow's open and sold after N
sessions". That single rule exercises the whole chain (signals, execution, fees,
accounting) without needing a strategy language.

Only symbols that ever appear in a signal are loaded, because the cgroup caps this
process at 2 GB and pulling the whole market's history for a year would not fit.
The response carries the parameters and the snapshot id so a result can be traced
back to the exact data it used.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from quant_workbench.backtest.engine import run_backtest
from quant_workbench.backtest.execution import FeeSchedule
from quant_workbench.backtest.metrics import compute_metrics
from quant_workbench.market.calendar import TradingCalendar

from .contracts import (
    BacktestParams,
    BacktestReport,
    BacktestTrade,
    DataMeta,
)
from .repository import (
    Connection,
    fetch_bars_for_symbols,
    fetch_latest_session,
    fetch_sessions,
    fetch_streak_signals,
)

STRATEGIES = {"first_board": "首板次日开盘买入"}
# A-share retail defaults: 3bp commission with a 5 yuan floor, 1bp sell-side stamp
# duty (as cut in 2023), 2bp slippage. Reported back so a result is reproducible.
FEES = FeeSchedule(
    commission_rate=Decimal("0.0003"),
    min_commission=Decimal("5"),
    stamp_duty_rate=Decimal("0.0001"),
    slippage_rate=Decimal("0.0002"),
)
MAX_SESSIONS = 500
DEFAULT_CAPITAL = Decimal("1000000")
DEFAULT_MAX_POSITIONS = 10
DEFAULT_HOLDING_DAYS = 5
WARMUP_DAYS = 10


def run(
    conn: Connection,
    *,
    strategy: str,
    start: date | None,
    end: date | None,
    capital: Decimal,
    max_positions: int,
    holding_days: int,
    snapshot_id: str,
    updated_at,
) -> BacktestReport:
    if strategy not in STRATEGIES:
        raise ValueError(f"unknown strategy: {strategy}")
    if capital <= 0:
        raise ValueError("capital must be positive")
    if max_positions < 1:
        raise ValueError("max_positions must be at least 1")
    if holding_days < 1:
        raise ValueError("holding_days must be at least 1")

    finish = end or fetch_latest_session(conn)
    if finish is None:
        raise ValueError("bars is empty; cannot backtest")
    sessions = fetch_sessions(conn)
    if not sessions:
        raise ValueError("no sessions in bars")
    begin = start or _default_start(sessions, finish)
    if begin > finish:
        raise ValueError(f"start {begin} is after end {finish}")
    span = [session for session in sessions if begin <= session <= finish]
    if len(span) > MAX_SESSIONS:
        raise ValueError(
            f"range covers {len(span)} sessions, limit is {MAX_SESSIONS}; narrow the dates"
        )
    if len(span) < 2:
        raise ValueError(f"range {begin}..{finish} holds {len(span)} sessions, need at least 2")

    # 首板 = streak exactly 1: a two-board stock is not a fresh first board.
    entries = {
        day: symbols
        for day, symbols in fetch_streak_signals(conn, begin, finish, streak=1).items()
        if symbols
    }
    symbols = sorted({symbol for picked in entries.values() for symbol in picked})
    if not symbols:
        return BacktestReport(
            meta=_meta(finish, snapshot_id, updated_at),
            params=_params(strategy, begin, finish, capital, max_positions, holding_days),
            starting_capital=float(capital),
            ending_equity=float(capital),
            equity=(),
            trades=(),
            skips={},
            total_return=None,
            annual_return=None,
            max_drawdown=None,
            win_rate=None,
            fees=0.0,
            note="区间内没有任何首板信号，未发生交易",
        )

    bars = fetch_bars_for_symbols(conn, symbols, begin - timedelta(days=WARMUP_DAYS), finish)
    calendar = TradingCalendar(sessions)
    result = run_backtest(
        bars=bars,
        entries=entries,
        calendar=calendar,
        fees=FEES,
        start=begin,
        end=finish,
        capital=capital,
        max_positions=max_positions,
        holding_days=holding_days,
    )
    metrics = compute_metrics(result.equity, result.trades)
    skips: dict[str, int] = {}
    for skip in result.skips:
        skips[skip.reason] = skips.get(skip.reason, 0) + 1
    return BacktestReport(
        meta=_meta(finish, snapshot_id, updated_at),
        params=_params(strategy, begin, finish, capital, max_positions, holding_days),
        starting_capital=float(capital),
        ending_equity=float(result.ending_equity),
        equity=tuple((day, float(value)) for day, value in result.equity),
        trades=tuple(
            BacktestTrade(
                symbol=trade.symbol,
                entry_date=trade.entry_date,
                exit_date=trade.exit_date,
                quantity=float(trade.quantity),
                entry_price=float(trade.entry_price),
                exit_price=float(trade.exit_price),
                fees=float(trade.fees),
                pnl=float(trade.pnl),
            )
            for trade in result.trades
        ),
        skips=skips,
        total_return=_float(metrics.total_return),
        annual_return=_float(metrics.annual_return),
        max_drawdown=_float(metrics.max_drawdown),
        win_rate=_float(metrics.win_rate),
        fees=float(metrics.fees),
        fee_schedule={
            "commission_rate": float(FEES.commission_rate),
            "min_commission": float(FEES.min_commission),
            "stamp_duty_rate": float(FEES.stamp_duty_rate),
            "slippage_rate": float(FEES.slippage_rate),
        },
        note="" if result.trades or result.skips else "区间内有信号但没有成交",
    )


def _default_start(sessions: list[date], finish: date) -> date:
    """A year of sessions by default: long enough to mean something, short enough to fit."""
    window = [session for session in sessions if session <= finish]
    return window[max(0, len(window) - 250)]


def _float(value: Decimal | None) -> float | None:
    return float(value) if value is not None else None


def _meta(trade_date: date, snapshot_id: str, updated_at) -> DataMeta:
    return DataMeta(as_of=trade_date, updated_at=updated_at, snapshot_id=snapshot_id, level="ok")


def _params(
    strategy: str, begin: date, finish: date, capital: Decimal, max_positions: int, holding_days: int
) -> BacktestParams:
    return BacktestParams(
        strategy=strategy,
        strategy_label=STRATEGIES[strategy],
        start=begin,
        end=finish,
        capital=float(capital),
        max_positions=max_positions,
        holding_days=holding_days,
    )
