"""Reads for the review endpoint.

The stored schema is fixed: table `bars` with an 8-character uppercase symbol
(`SH600000`), a VARCHAR trade date (`YYYY-MM-DD`), an `is_trading` boolean and a
`tradestatus` integer kept only for audit. Values are converted to the canonical
models here so nothing downstream sees floats or SQL types.
"""

from __future__ import annotations

import os
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, NamedTuple, Protocol, Sequence

from quant_workbench.data import DailyBar

INSTRUMENTS_META_PATH = os.environ.get(
    "QW_INSTRUMENTS_META_PATH", "data/parquet/instruments_meta.parquet"
)
INSTRUMENTS_META_STATUSES = frozenset({"ok", "empty_for_delisted", "missing", "missing_basic"})
INSTRUMENTS_META_SQL = """
SELECT symbol, name, industry, industry_status
FROM read_parquet(?)
"""


class InstrumentsMetaEntry(NamedTuple):
    name: str | None
    industry: str | None
    status: str | None


ONE_SESSION_SQL = """
SELECT symbol, trade_date, open, high, low, close, preclose, volume, amount,
       turn, is_st, is_trading
FROM bars
WHERE trade_date = ?
ORDER BY symbol
"""

SESSION_COUNT_SQL = "SELECT count(*) FROM bars WHERE trade_date = ?"

NULL_PRICE_SQL = """
SELECT count(*) FROM bars
WHERE trade_date = ? AND "close" IS NULL
"""

INSTRUMENTS_SQL = "SELECT symbol, first_trade_date FROM instruments"

SESSIONS_SQL = "SELECT DISTINCT trade_date FROM bars ORDER BY trade_date"

LATEST_SNAPSHOT_SQL = """
SELECT snapshot_id, max(recorded_at)
FROM data_quality
GROUP BY snapshot_id
ORDER BY max(recorded_at) DESC
LIMIT 1
"""

INDEX_QUOTES_SQL = """
SELECT b.code, m.name, b.close, b.pct_chg, b.amount
FROM index_bars b
JOIN index_meta m ON m.code = b.code
WHERE b.trade_date = ?
ORDER BY b.code
"""

LADDER_SQL = """
SELECT s.symbol, s.streak, s.is_one_word
FROM limit_streaks s
LEFT JOIN bars b ON b.symbol = s.symbol AND b.trade_date = s.trade_date
WHERE s.trade_date = ? AND s.streak >= ? AND (? OR coalesce(b.is_st, 0) = 0)
ORDER BY s.streak DESC, s.symbol
"""

SYMBOL_BARS_SQL = """
SELECT symbol, trade_date, open, high, low, close, preclose, volume, amount,
       turn, is_st, is_trading
FROM bars
WHERE symbol = ? AND trade_date <= ?
ORDER BY trade_date DESC
LIMIT ?
"""

SYMBOL_BOARD_SQL = "SELECT board FROM instruments WHERE symbol = ?"

RESOLVE_EXACT_SYMBOL_SQL = "SELECT symbol FROM instruments WHERE symbol = ?"
RESOLVE_SYMBOL_SQL = "SELECT symbol FROM instruments WHERE right(symbol, 6) = ? ORDER BY symbol"

LATEST_SESSION_SQL = "SELECT max(trade_date) FROM bars"

SYMBOL_STREAK_SQL = """
SELECT count(*), coalesce(max(streak), 0)
FROM limit_streaks
WHERE symbol = ? AND trade_date BETWEEN ? AND ?
"""

SESSION_STATS_SQL = """
SELECT trade_date, up, down, flat, sealed_up, broken_up, sealed_down,
       touched_up, seal_rate, max_ladder, ladder_count, amount
FROM session_stats
WHERE trade_date <= ?
ORDER BY trade_date DESC
LIMIT ?
"""

INDEX_CLOSES_SQL = """
SELECT b.code, m.name, b.trade_date, b.close
FROM index_bars b
JOIN index_meta m ON m.code = b.code
WHERE b.trade_date <= ? AND b.trade_date >= ?
ORDER BY b.code, b.trade_date
"""

SESSION_AMOUNT_SQL = "SELECT coalesce(sum(amount), 0) FROM bars WHERE trade_date = ? AND is_trading"

PREVIOUS_SESSION_SQL = "SELECT max(trade_date) FROM bars WHERE trade_date < ?"

PROMOTION_SQL = """
WITH prev AS (SELECT symbol, streak FROM limit_streaks WHERE trade_date = ?),
     cur AS (SELECT symbol, streak FROM limit_streaks WHERE trade_date = ?)
SELECT prev.streak, count(*), count(cur.symbol)
FROM prev
LEFT JOIN cur ON cur.symbol = prev.symbol AND cur.streak = prev.streak + 1
GROUP BY prev.streak
ORDER BY prev.streak
"""

PREV_LIMIT_SQL = """
WITH prev AS (SELECT symbol FROM limit_streaks WHERE trade_date = ?)
SELECT (b."close" / b.preclose - 1) * 100
FROM prev
JOIN bars b ON b.symbol = prev.symbol AND b.trade_date = ? AND b.is_trading AND b.preclose > 0
WHERE b."close" IS NOT NULL
"""

STREAK_SIGNALS_SQL = """
SELECT trade_date, symbol FROM limit_streaks
WHERE trade_date BETWEEN ? AND ? AND streak = ?
ORDER BY trade_date, symbol
"""

SYMBOL_RANGE_SQL = """
SELECT symbol, trade_date, open, high, low, close, preclose, volume, amount,
       turn, is_st, is_trading
FROM bars
WHERE symbol IN ({placeholders}) AND trade_date BETWEEN ? AND ?
ORDER BY symbol, trade_date
"""

BENCHMARK_SQL = """
SELECT trade_date, "close" FROM index_bars
WHERE code = ? AND trade_date BETWEEN ? AND ?
ORDER BY trade_date
"""

QUALITY_SQL = """
SELECT check_id, scope, value, threshold, verdict, note
FROM data_quality
ORDER BY verdict, check_id
"""


class Connection(Protocol):
    """Subset of the duckdb connection used here; keeps tests dependency-free."""

    def execute(self, query: str, parameters: Sequence[Any] | None = None) -> Any: ...


def fetch_first_trade_dates(conn: Connection) -> dict[str, date]:
    """Listing proxy: the earliest session each instrument appears in `bars`."""
    rows = conn.execute(INSTRUMENTS_SQL).fetchall()
    return {symbol: date.fromisoformat(stored) for symbol, stored in rows}


def fetch_sessions(conn: Connection) -> list[date]:
    rows = conn.execute(SESSIONS_SQL).fetchall()
    return [date.fromisoformat(stored) for (stored,) in rows]


def fetch_latest_snapshot(conn: Connection) -> tuple[str, datetime]:
    """Newest recorded data-quality snapshot; the only honest source for updated_at."""
    rows = conn.execute(LATEST_SNAPSHOT_SQL).fetchall()
    if not rows or rows[0][0] is None:
        raise ValueError("data_quality holds no snapshot; refusing to report unknown provenance")
    snapshot_id, recorded_at = rows[0]
    stamp = datetime.fromisoformat(str(recorded_at).replace("Z", "+00:00"))
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return str(snapshot_id), stamp


def fetch_index_quotes(conn: Connection, trade_date: date) -> list[tuple[str, str, float, float, float]]:
    return list(conn.execute(INDEX_QUOTES_SQL, [trade_date.isoformat()]).fetchall())


def fetch_ladder(
    conn: Connection, trade_date: date, min_streak: int, *, include_st: bool = False
) -> list[tuple[str, int, bool]]:
    """Ladder rows, excluding ST by default so it matches the sealed-up count above it."""
    return list(
        conn.execute(LADDER_SQL, [trade_date.isoformat(), min_streak, include_st]).fetchall()
    )


def fetch_quality_checks(conn: Connection) -> list[dict[str, Any]]:
    rows = conn.execute(QUALITY_SQL).fetchall()
    keys = ("check_id", "scope", "value", "threshold", "verdict", "note")
    return [dict(zip(keys, row)) for row in rows]


def resolve_symbol(conn: Connection, code: str) -> str:
    """Accept `SH600000` or `600000`; a bare six-digit code must be unambiguous."""
    text = code.strip().upper()
    if len(text) == 8:
        if text[:2] not in {"SH", "SZ"} or not text[2:].isdigit():
            raise ValueError(f"invalid instrument code: {code}")
        rows = conn.execute(RESOLVE_EXACT_SYMBOL_SQL, [text]).fetchall()
        if not rows:
            raise KeyError(code)
        return str(rows[0][0])
    if len(text) != 6 or not text.isdigit():
        raise ValueError(f"invalid instrument code: {code}")
    rows = conn.execute(RESOLVE_SYMBOL_SQL, [text]).fetchall()
    if not rows:
        raise KeyError(code)
    if len(rows) > 1:
        raise ValueError(f"ambiguous instrument code {code}: {', '.join(row[0] for row in rows)}")
    return str(rows[0][0])


def fetch_symbol_board(conn: Connection, symbol: str) -> str | None:
    rows = conn.execute(SYMBOL_BOARD_SQL, [symbol]).fetchall()
    return str(rows[0][0]) if rows else None


def fetch_latest_session(conn: Connection) -> date | None:
    rows = conn.execute(LATEST_SESSION_SQL).fetchall()
    stored = rows[0][0] if rows else None
    return date.fromisoformat(str(stored)) if stored else None


def fetch_symbol_history(conn: Connection, symbol: str, end: date, limit: int) -> list[DailyBar]:
    """Newest `limit` sessions up to `end`, oldest first; price-less rows are dropped."""
    rows = conn.execute(SYMBOL_BARS_SQL, [symbol, end.isoformat(), limit]).fetchall()
    bars = []
    for row in reversed(rows):
        bar = _to_bar(row)
        if bar is not None:
            bars.append(bar)
    return bars


def fetch_symbol_streaks(conn: Connection, symbol: str, start: date, end: date) -> tuple[int, int]:
    """(sealed limit-up count, longest streak) inside the window, from the precomputed table."""
    rows = conn.execute(SYMBOL_STREAK_SQL, [symbol, start.isoformat(), end.isoformat()]).fetchall()
    if not rows:
        return 0, 0
    return int(rows[0][0]), int(rows[0][1])


def fetch_session_amount(conn: Connection, trade_date: date) -> float:
    rows = conn.execute(SESSION_AMOUNT_SQL, [trade_date.isoformat()]).fetchall()
    return float(rows[0][0]) if rows and rows[0][0] is not None else 0.0


def fetch_previous_session(conn: Connection, trade_date: date) -> date | None:
    rows = conn.execute(PREVIOUS_SESSION_SQL, [trade_date.isoformat()]).fetchall()
    stored = rows[0][0] if rows else None
    return date.fromisoformat(str(stored)) if stored else None


def fetch_promotion(conn: Connection, previous: date, current: date) -> list[tuple[int, int, int]]:
    rows = conn.execute(PROMOTION_SQL, [previous.isoformat(), current.isoformat()]).fetchall()
    return [(int(row[0]), int(row[1]), int(row[2])) for row in rows]


def fetch_prev_limit_changes(conn: Connection, previous: date, current: date) -> list[float]:
    rows = conn.execute(PREV_LIMIT_SQL, [previous.isoformat(), current.isoformat()]).fetchall()
    return [float(row[0]) for row in rows if row[0] is not None]


def fetch_streak_signals(conn: Connection, start: date, end: date, streak: int) -> dict[date, list[str]]:
    """Signals keyed by the session that produced them (acted on at the next open)."""
    rows = conn.execute(STREAK_SIGNALS_SQL, [start.isoformat(), end.isoformat(), streak]).fetchall()
    signals: dict[date, list[str]] = {}
    for stored_date, symbol in rows:
        signals.setdefault(date.fromisoformat(str(stored_date)), []).append(str(symbol))
    return signals


def fetch_bars_for_symbols(
    conn: Connection, symbols: Sequence[str], start: date, end: date, chunk: int = 400
) -> dict[str, list[DailyBar]]:
    """Bars for the given symbols only; chunked so a long IN list cannot exhaust memory."""
    out: dict[str, list[DailyBar]] = {}
    ordered = sorted(symbols)
    for index in range(0, len(ordered), chunk):
        batch = ordered[index : index + chunk]
        placeholders = ",".join("?" for _ in batch)
        query = SYMBOL_RANGE_SQL.format(placeholders=placeholders)
        rows = conn.execute(query, [*batch, start.isoformat(), end.isoformat()]).fetchall()
        for row in rows:
            bar = _to_bar(row)
            if bar is not None:
                out.setdefault(bar.symbol, []).append(bar)
    return out


def fetch_index_close_map(conn: Connection, code: str, start: date, end: date) -> dict[str, float]:
    rows = conn.execute(BENCHMARK_SQL, [code, start.isoformat(), end.isoformat()]).fetchall()
    return {str(stored): float(close) for stored, close in rows if close is not None}


def fetch_session_stats(conn: Connection, end: date, limit: int) -> list[tuple[Any, ...]]:
    """Newest `limit` days of market aggregates, oldest first."""
    rows = conn.execute(SESSION_STATS_SQL, [end.isoformat(), limit]).fetchall()
    return list(reversed(rows))


def fetch_index_closes(
    conn: Connection, start: date, end: date
) -> list[tuple[str, str, str, float]]:
    return list(conn.execute(INDEX_CLOSES_SQL, [end.isoformat(), start.isoformat()]).fetchall())


def _to_decimal(value: Any) -> Decimal:
    """Floats carry binary noise, so go through str before it reaches the model."""
    if value is None:
        raise ValueError("cannot convert NULL to a decimal")
    return Decimal(str(value))


def _traded_value(value: Any, symbol: str, field: str) -> Decimal:
    """A traded session must carry the field; NULL here is a data fault, not a zero."""
    if value is None:
        raise ValueError(f"{symbol} is marked as trading but {field} is NULL")
    return _to_decimal(value)


def _idle_value(value: Any) -> Decimal:
    """Suspended sessions store NULL for volume and amount; the model wants zero."""
    return Decimal("0") if value is None else _to_decimal(value)


def fetch_session_bars(conn: Connection, trade_date: date) -> list[DailyBar]:
    """Bars with usable prices.

    A suspended session occasionally arrives with every price column NULL; such a row
    carries no price and is dropped here, then reported by `fetch_null_price_count` so
    the caller can say how many rows it set aside instead of inventing a zero price.
    """
    rows = conn.execute(ONE_SESSION_SQL, [trade_date.isoformat()]).fetchall()
    bars = []
    for row in rows:
        bar = _to_bar(row)
        if bar is not None:
            bars.append(bar)
    return bars


def fetch_null_price_count(conn: Connection, trade_date: date) -> int:
    rows = conn.execute(NULL_PRICE_SQL, [trade_date.isoformat()]).fetchall()
    return int(rows[0][0]) if rows else 0


def fetch_session_bar_count(conn: Connection, trade_date: date) -> int:
    rows = conn.execute(SESSION_COUNT_SQL, [trade_date.isoformat()]).fetchall()
    return int(rows[0][0]) if rows else 0


def _to_bar(row: Sequence[Any]) -> DailyBar | None:
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
    if close is None or open_price is None or high is None or low is None:
        return None
    trading = bool(is_trading)
    volume_value = _traded_value(volume, symbol, "volume") if trading else _idle_value(volume)
    amount_value = _traded_value(amount, symbol, "amount") if trading else _idle_value(amount)
    return DailyBar(
        symbol=symbol,
        trade_date=date.fromisoformat(stored_date),
        open=_to_decimal(open_price),
        high=_to_decimal(high),
        low=_to_decimal(low),
        close=_to_decimal(close),
        volume=volume_value,
        amount=amount_value,
        preclose=_to_decimal(preclose) if preclose is not None else None,
        turn=_to_decimal(turn) if turn is not None else None,
        trading=trading,
        is_st=bool(is_st),
    )


def fetch_instruments_meta(path: str | None = None) -> dict[str, InstrumentsMetaEntry] | None:
    """Read the optional instruments_meta parquet, or None when no such file exists.

    None and an empty dict mean different things: None is "metadata is not available",
    and every caller must then leave name/industry/industry_status as None instead of
    reporting the source as having no record. A symbol absent from a file that does
    exist is reported the same way, because the loader never queried it either.
    """
    resolved = path if path is not None else INSTRUMENTS_META_PATH
    if not resolved or not os.path.exists(resolved):
        return None
    import duckdb  # local import: this reader needs its own handle, not the injected Connection

    conn = duckdb.connect()
    try:
        rows = conn.execute(INSTRUMENTS_META_SQL, [resolved]).fetchall()
    finally:
        conn.close()
    entries: dict[str, InstrumentsMetaEntry] = {}
    for symbol, name, industry, status in rows:
        if status is not None and status not in INSTRUMENTS_META_STATUSES:
            raise ValueError(
                f"instruments_meta has an unknown industry_status {status!r} for {symbol}"
            )
        # Blank strings are stored as None so a "" can never reach JSON as a label.
        entries[str(symbol)] = InstrumentsMetaEntry(name or None, industry or None, status)
    return entries
