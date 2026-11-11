from __future__ import annotations

from datetime import date
from decimal import Decimal

from quant_workbench.data import DailyBar


def bar(
    symbol: str,
    trade_date: date,
    *,
    preclose: str,
    open: str,
    high: str,
    low: str,
    close: str,
    trading: bool = True,
    is_st: bool = False,
) -> DailyBar:
    """Build a bar from decimal strings so fixtures stay exact."""
    return DailyBar(
        symbol=symbol,
        trade_date=trade_date,
        open=Decimal(open),
        high=Decimal(high),
        low=Decimal(low),
        close=Decimal(close),
        volume=Decimal("100") if trading else Decimal("0"),
        amount=Decimal("1000") if trading else Decimal("0"),
        preclose=Decimal(preclose),
        trading=trading,
        is_st=is_st,
    )


def suspended(symbol: str, trade_date: date, price: str) -> DailyBar:
    """A suspended day as baostock reports it: prior close repeated, zero volume."""
    return DailyBar(
        symbol=symbol,
        trade_date=trade_date,
        open=Decimal(price),
        high=Decimal(price),
        low=Decimal(price),
        close=Decimal(price),
        volume=Decimal("0"),
        amount=Decimal("0"),
        preclose=Decimal(price),
        trading=False,
    )
