"""Order fills for a daily backtest.

Signal is confirmed on the close of T and the earliest executable moment is the
open of T+1. This module owns the three ways that open can fail to fill, so no
caller re-implements them: the stock did not trade, it opened at the upper limit
(nothing to buy), or it opened at the lower limit (nothing to sell).

Fees are passed in explicitly; there are no default rates, because a default fee
silently changes every past backtest result the moment it is edited.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

from quant_workbench.data import DailyBar
from quant_workbench.market.limits import board_from_symbol, limit_prices, limit_ratio

BUY = "buy"
SELL = "sell"

NO_TRADE = "no_trade"
LIMIT_UP_OPEN = "limit_up_open"
LIMIT_DOWN_OPEN = "limit_down_open"
NO_REFERENCE_PRICE = "no_reference_price"

_CENT = Decimal("0.01")


@dataclass(frozen=True, slots=True)
class FeeSchedule:
    """Rates as decimals (0.0003 = 3 bps); amounts in yuan."""

    commission_rate: Decimal
    min_commission: Decimal
    stamp_duty_rate: Decimal
    slippage_rate: Decimal

    def __post_init__(self) -> None:
        for name in ("commission_rate", "min_commission", "stamp_duty_rate", "slippage_rate"):
            if getattr(self, name) < 0:
                raise ValueError(f"{name} must be non-negative")


@dataclass(frozen=True, slots=True)
class Fill:
    side: str
    price: Decimal
    quantity: Decimal
    fee: Decimal

    @property
    def notional(self) -> Decimal:
        return self.price * self.quantity


@dataclass(frozen=True, slots=True)
class Rejection:
    reason: str
    detail: str


def open_fill_price(bar: DailyBar, side: str, fees: FeeSchedule) -> Decimal:
    """Price a market order would fill at, before any limit or suspension check.

    Shared with sizing so a strategy never budgets against one price and fills at
    another.
    """
    if side not in (BUY, SELL):
        raise ValueError(f"side must be {BUY} or {SELL}, got {side!r}")
    slip = bar.open * fees.slippage_rate
    price = (bar.open + slip) if side == BUY else (bar.open - slip)
    return price.quantize(_CENT, rounding=ROUND_HALF_UP)


def fill_at_open(
    bar: DailyBar,
    side: str,
    quantity: Decimal,
    fees: FeeSchedule,
    *,
    new_listing_window: bool = False,
) -> Fill | Rejection:
    """Try to trade `quantity` shares at the bar's open, or explain why not."""
    if side not in (BUY, SELL):
        raise ValueError(f"side must be {BUY} or {SELL}, got {side!r}")
    if quantity <= 0:
        raise ValueError("quantity must be positive")
    if not bar.trading:
        return Rejection(NO_TRADE, f"{bar.symbol} did not trade on {bar.trade_date}")
    if bar.preclose is None or bar.preclose <= 0:
        return Rejection(NO_REFERENCE_PRICE, f"{bar.symbol} has no usable preclose on {bar.trade_date}")

    ratio = limit_ratio(
        board_from_symbol(bar.symbol),
        bar.is_st,
        bar.trade_date,
        new_listing_window=new_listing_window,
    )
    limits = limit_prices(bar.preclose, ratio)
    if limits is not None:
        upper, lower = limits
        if side == BUY and bar.open >= upper:
            return Rejection(LIMIT_UP_OPEN, f"{bar.symbol} opened at the upper limit {upper}")
        if side == SELL and bar.open <= lower:
            return Rejection(LIMIT_DOWN_OPEN, f"{bar.symbol} opened at the lower limit {lower}")

    price = open_fill_price(bar, side, fees)
    if price <= 0:
        return Rejection(NO_REFERENCE_PRICE, f"slippage drives {bar.symbol} price to {price}")

    commission = max(price * quantity * fees.commission_rate, fees.min_commission)
    stamp = price * quantity * fees.stamp_duty_rate if side == SELL else Decimal("0")
    fee = (commission + stamp).quantize(_CENT, rounding=ROUND_HALF_UP)
    return Fill(side=side, price=price, quantity=quantity, fee=fee)
