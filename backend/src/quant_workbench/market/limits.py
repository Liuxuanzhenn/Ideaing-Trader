"""A-share daily price limit rules, keyed by board and historical regime.

These are exchange facts, not UI settings. Every caller computes limit prices
through this module so a stock's limit is derived one way in research, screening
and backtest alike.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from quant_workbench.data import DailyBar

MAIN = "main"
GROWTH = "growth"
STAR = "star"

# 创业板注册制改革：涨跌幅 10% -> 20%，ST 股同样适用 20%。
GROWTH_REFORM = date(2020, 8, 24)

_BOARD_BY_PREFIX = {"60": MAIN, "68": STAR, "00": MAIN, "30": GROWTH}
_TICK = Decimal("0.01")
ST_RATIO = Decimal("0.05")
NEW_LISTING_SESSIONS = 5


def board_from_symbol(symbol: str) -> str:
    """Map a 6-digit code (bare or exchange-prefixed) to its board."""
    code = symbol.strip()[-6:]
    board = _BOARD_BY_PREFIX.get(code[:2])
    if board is None:
        raise ValueError(f"{symbol} is not on a covered A-share board")
    return board


def limit_ratio(
    board: str,
    is_st: bool,
    trade_date: date,
    *,
    new_listing_window: bool = False,
) -> Decimal | None:
    """Return the symmetric daily limit ratio, or None when no limit applies.

    `new_listing_window` is decided by the caller, which owns the trading
    calendar and the listing date; this module must not guess it.

    shortcut: 主板注册制前新股首日 44%/36% 的不对称规则未建模，遇到时按无限制
    处理并由调用方标记；黄金样本需要覆盖首日时再补。
    """
    if board not in _BOARD_BY_PREFIX.values():
        raise ValueError(f"unknown board: {board}")
    if new_listing_window:
        return None
    if board is STAR:
        return Decimal("0.20")
    if board is GROWTH:
        return Decimal("0.20") if trade_date >= GROWTH_REFORM else _main_ratio(is_st)
    return _main_ratio(is_st)


def _main_ratio(is_st: bool) -> Decimal:
    return ST_RATIO if is_st else Decimal("0.10")


def is_st_effective(bar: DailyBar) -> bool:
    """Trust the ST flag unless the day's own price range disproves it.

    A main-board risk-warning stock is capped at 5%, so a move outside that band
    proves the flag is stale (typically the day the warning is lifted). New boards
    keep 20% for ST stocks, so no contradiction can be inferred there.
    """
    if not bar.is_st:
        return False
    if board_from_symbol(bar.symbol) is not MAIN:
        return True
    if bar.preclose is None or bar.preclose <= 0:
        return True
    upper, lower = limit_prices(bar.preclose, ST_RATIO)
    return not (bar.high > upper or bar.low < lower)


def limit_prices(preclose: Decimal, ratio: Decimal | None) -> tuple[Decimal, Decimal] | None:
    """Rounded (upper, lower) limit prices, or None when the day has no limit."""
    if ratio is None:
        return None
    if preclose <= 0:
        raise ValueError("preclose must be positive to derive limit prices")
    upper = (preclose * (1 + ratio)).quantize(_TICK, rounding=ROUND_HALF_UP)
    lower = (preclose * (1 - ratio)).quantize(_TICK, rounding=ROUND_HALF_UP)
    return upper, lower
