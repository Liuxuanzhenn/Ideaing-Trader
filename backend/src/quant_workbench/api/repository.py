"""Reads for the review endpoint.

The stored schema is fixed: table `bars` with an 8-character uppercase symbol
(`SH600000`), a VARCHAR trade date (`YYYY-MM-DD`), an `is_trading` boolean and a
`tradestatus` integer kept only for audit. Values are converted to the canonical
models here so nothing downstream sees floats or SQL types.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Protocol, Sequence

from quant_workbench.data import DailyBar

ONE_SESSION_SQL = """
SELECT symbol, trade_date, open, high, low, close, preclose, volume, amount,
       turn, is_st, is_trading
FROM bars
WHERE trade_date = ?
ORDER BY symbol
"""

SESSION_COUNT_SQL = "SELECT count(*) FROM bars WHERE trade_date = ?"


class Connection(Protocol):
    """Subset of the duckdb connection used here; keeps tests dependency-free."""

    def execute(self, query: str, parameters: Sequence[Any] | None = None) -> Any: ...


def _to_decimal(value: Any) -> Decimal:
    """Floats carry binary noise, so go through str before it reaches the model."""
    return Decimal(str(value))


def fetch_session_bars(conn: Connection, trade_date: date) -> list[DailyBar]:
    rows = conn.execute(ONE_SESSION_SQL, [trade_date.isoformat()]).fetchall()
    return [_to_bar(row) for row in rows]


def fetch_session_bar_count(conn: Connection, trade_date: date) -> int:
    rows = conn.execute(SESSION_COUNT_SQL, [trade_date.isoformat()]).fetchall()
    return int(rows[0][0]) if rows else 0


def _to_bar(row: Sequence[Any]) -> DailyBar:
    (
        symbol,
        stored_date,
        open_price,
        high,
        low,
        close,
        preclose,
        volume,
        amount,
        turn,
        is_st,
        is_trading,
    ) = row
    return DailyBar(
        symbol=symbol,
        trade_date=date.fromisoformat(stored_date),
        open=_to_decimal(open_price),
        high=_to_decimal(high),
        low=_to_decimal(low),
        close=_to_decimal(close),
        volume=_to_decimal(volume),
        amount=_to_decimal(amount),
        preclose=_to_decimal(preclose) if preclose is not None else None,
        turn=_to_decimal(turn) if turn is not None else None,
        trading=bool(is_trading),
        is_st=bool(is_st),
    )
