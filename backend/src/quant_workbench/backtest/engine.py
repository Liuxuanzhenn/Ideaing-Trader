"""Daily portfolio loop for a single-strategy backtest.

Signals are confirmed on a session's close and acted on at the next session's
open, so the loop only ever reads a bar it is allowed to trade. A rejected order
is recorded instead of being silently retried forever: a suspended or
limit-locked exit waits for the next session, and a rejected entry is dropped.

Position sizing is deliberately simple (equal cash per slot, whole lots). Anything
cleverer belongs in a strategy, not in the accounting.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_DOWN
from typing import Mapping, Sequence

from quant_workbench.data import DailyBar
from quant_workbench.market.calendar import TradingCalendar

from .execution import BUY, SELL, FeeSchedule, Fill, Rejection, fill_at_open, open_fill_price

LOT = Decimal("100")
SHARES = Decimal("1")


@dataclass(frozen=True, slots=True)
class Trade:
    symbol: str
    entry_date: date
    exit_date: date
    quantity: Decimal
    entry_price: Decimal
    exit_price: Decimal
    fees: Decimal

    @property
    def pnl(self) -> Decimal:
        return (self.exit_price - self.entry_price) * self.quantity - self.fees


@dataclass(frozen=True, slots=True)
class Skip:
    trade_date: date
    symbol: str
    reason: str


@dataclass(frozen=True, slots=True)
class BacktestResult:
    starting_capital: Decimal
    equity: tuple[tuple[date, Decimal], ...]
    trades: tuple[Trade, ...]
    skips: tuple[Skip, ...]

    @property
    def ending_equity(self) -> Decimal:
        return self.equity[-1][1] if self.equity else self.starting_capital


@dataclass(slots=True)
class _Position:
    symbol: str
    quantity: Decimal
    entry_date: date
    entry_price: Decimal
    entry_fee: Decimal
    exit_on: date


def run_backtest(
    *,
    bars: Mapping[str, Sequence[DailyBar]],
    entries: Mapping[date, Sequence[str]],
    calendar: TradingCalendar,
    fees: FeeSchedule,
    start: date,
    end: date,
    capital: Decimal,
    max_positions: int,
    holding_days: int,
) -> BacktestResult:
    """Run the loop over `calendar` between `start` and `end` inclusive."""
    if capital <= 0:
        raise ValueError("capital must be positive")
    if max_positions < 1:
        raise ValueError("max_positions must be at least 1")
    if holding_days < 1:
        raise ValueError("holding_days must be at least 1")

    index: dict[str, dict[date, DailyBar]] = {
        symbol: {bar.trade_date: bar for bar in series} for symbol, series in bars.items()
    }
    known_closes: dict[str, list[tuple[date, Decimal]]] = {
        symbol: sorted((bar.trade_date, bar.close) for bar in series if bar.trading)
        for symbol, series in bars.items()
    }
    sessions = [day for day in calendar.sessions if start <= day <= end]
    cash = capital
    positions: list[_Position] = []
    trades: list[Trade] = []
    skips: list[Skip] = []
    equity: list[tuple[date, Decimal]] = []
    pending_entries: Sequence[str] = ()

    for session in sessions:
        still_held: list[_Position] = []
        for position in positions:
            if position.exit_on > session:
                still_held.append(position)
                continue
            bar = index.get(position.symbol, {}).get(session)
            outcome = (
                fill_at_open(bar, SELL, position.quantity, fees)
                if bar is not None
                else Rejection("no_bar", f"{position.symbol} has no bar on {session}")
            )
            if isinstance(outcome, Rejection):
                skips.append(Skip(session, position.symbol, outcome.reason))
                position.exit_on = calendar.next(session) or session
                still_held.append(position)
                continue
            cash += outcome.notional - outcome.fee
            trades.append(
                Trade(
                    symbol=position.symbol,
                    entry_date=position.entry_date,
                    exit_date=session,
                    quantity=position.quantity,
                    entry_price=position.entry_price,
                    exit_price=outcome.price,
                    fees=position.entry_fee + outcome.fee,
                )
            )
        positions = still_held

        for symbol in pending_entries:
            if len(positions) >= max_positions:
                skips.append(Skip(session, symbol, "no_free_slot"))
                continue
            bar = index.get(symbol, {}).get(session)
            if bar is None:
                skips.append(Skip(session, symbol, "no_bar"))
                continue
            budget = cash / Decimal(max_positions - len(positions))
            price = open_fill_price(bar, BUY, fees)
            quantity = (budget / price / LOT).to_integral_value(rounding=ROUND_DOWN) * LOT
            if quantity < LOT or quantity * price > cash:
                skips.append(Skip(session, symbol, "budget_too_small"))
                continue
            outcome = fill_at_open(bar, BUY, quantity, fees)
            if isinstance(outcome, Rejection):
                skips.append(Skip(session, symbol, outcome.reason))
                continue
            cash -= outcome.notional + outcome.fee
            if cash < 0:
                raise ValueError(f"cash went negative buying {symbol} on {session}")
            positions.append(
                _Position(
                    symbol=symbol,
                    quantity=outcome.quantity,
                    entry_date=session,
                    entry_price=outcome.price,
                    entry_fee=outcome.fee,
                    exit_on=_exit_session(calendar, session, holding_days),
                )
            )

        pending_entries = entries.get(session, ())
        equity.append((session, cash + _mark_to_market(positions, known_closes, session)))

    return BacktestResult(
        starting_capital=capital,
        equity=tuple(equity),
        trades=tuple(trades),
        skips=tuple(skips),
    )


def _exit_session(calendar: TradingCalendar, entry: date, holding_days: int) -> date:
    target = calendar.shift(entry, holding_days)
    return target if target is not None else entry


def _mark_to_market(
    positions: Sequence[_Position],
    known_closes: Mapping[str, Sequence[tuple[date, Decimal]]],
    session: date,
) -> Decimal:
    """Value holdings at the last close known on or before `session`.

    A suspended stock keeps its previous close rather than dropping out of the
    portfolio, which is what a holder would actually see.
    """
    value = Decimal("0")
    for position in positions:
        value += _last_close(known_closes.get(position.symbol, ()), session) * position.quantity
    return value


def _last_close(series: Sequence[tuple[date, Decimal]], session: date) -> Decimal:
    if not series:
        raise ValueError(f"no price history to value a position on {session}")
    latest: tuple[date, Decimal] | None = None
    for day, close in series:
        if day > session:
            break
        latest = (day, close)
    if latest is None:
        raise ValueError(f"no close on or before {session}")
    return latest[1]
