"""Backtest execution rules: signals, fills, fees, portfolio loop."""

from .engine import BacktestResult, Skip, Trade, run_backtest
from .metrics import Metrics, compute_metrics, max_drawdown
from .execution import (
    BUY,
    LIMIT_DOWN_OPEN,
    LIMIT_UP_OPEN,
    NO_REFERENCE_PRICE,
    NO_TRADE,
    SELL,
    FeeSchedule,
    Fill,
    Rejection,
    fill_at_open,
)

__all__ = [
    "BUY",
    "BacktestResult",
    "Skip",
    "Trade",
    "run_backtest",
    "LIMIT_DOWN_OPEN",
    "LIMIT_UP_OPEN",
    "NO_REFERENCE_PRICE",
    "NO_TRADE",
    "SELL",
    "FeeSchedule",
    "Metrics",
    "compute_metrics",
    "max_drawdown",
    "Fill",
    "Rejection",
    "fill_at_open",
]
