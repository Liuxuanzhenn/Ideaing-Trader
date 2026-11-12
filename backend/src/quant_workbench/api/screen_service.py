"""Screen the stored universe for one session.

Every field here is computed from tables that already exist: `bars` for price,
turnover and amount, `limit_streaks` for the consecutive-limit-up count. Fields the
database cannot answer (market cap, industry) are refused with an explanation rather
than silently ignored, because a filter that quietly does nothing returns rows the
user did not ask for.

ST rows are excluded by default and counted, matching the review view: a screen that
shrinks its own universe without saying so is worse than a narrow one.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Mapping

from .contracts import DataMeta, ScreenOptions, ScreenResult, ScreenRow
from .repository import Connection, InstrumentsMetaEntry, fetch_latest_session

MAX_CONDITIONS = 6
LIMIT_WINDOW = 20

FIELD_SQL = {
    "chg_pct": "(d.close / d.preclose - 1) * 100",
    "ladder": "coalesce(s.ladder, 0)",
    "turnover_pct": "d.turn",
    "amount": "d.amount",
    "limit_20": "coalesce(s.limit_20, 0)",
}
OPS = {"gte": ">=", "lte": "<=", "eq": "="}
UNAVAILABLE = {
    "mcap": "流通市值需要股本数据，当前库中没有；该条件不可用，不会被忽略",
}

SCREEN_SQL = """
WITH day AS (
    SELECT symbol, close, preclose, turn, amount
    FROM bars
    WHERE trade_date = ? AND is_trading AND "close" IS NOT NULL AND preclose > 0
      AND (? OR is_st = 0)
),
streak AS (
    SELECT symbol,
           max(CASE WHEN trade_date = ? THEN streak ELSE 0 END) AS ladder,
           count(*) AS limit_20
    FROM limit_streaks
    WHERE trade_date BETWEEN ? AND ?
    GROUP BY symbol
)
SELECT d.symbol, d.close, (d.close / d.preclose - 1) * 100, d.turn, d.amount,
       coalesce(s.ladder, 0), coalesce(s.limit_20, 0)
FROM day d
LEFT JOIN streak s ON s.symbol = d.symbol
"""


def screen(
    conn: Connection,
    conditions: list[dict],
    trade_date: date | None,
    *,
    snapshot_id: str,
    updated_at: datetime,
    exclude_st: bool = True,
    meta: Mapping[str, InstrumentsMetaEntry] | None = None,
) -> ScreenResult:
    if len(conditions) > MAX_CONDITIONS:
        raise ValueError(f"at most {MAX_CONDITIONS} conditions, got {len(conditions)}")
    end = trade_date or fetch_latest_session(conn)
    if end is None:
        raise ValueError("bars is empty; cannot screen")

    where = []
    params: list[object] = []
    for condition in conditions:
        field = condition.get("field")
        op = condition.get("op")
        if field in UNAVAILABLE:
            raise ValueError(UNAVAILABLE[field])
        if field not in FIELD_SQL:
            raise ValueError(f"unknown screen field: {field}")
        if op not in OPS:
            raise ValueError(f"unknown screen operator: {op}")
        value = condition.get("value")
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise ValueError(f"screen value must be a number, got {value!r}")
        where.append(f"{FIELD_SQL[field]} {OPS[op]} ?")
        params.append(value)

    window_start = conn.execute(
        "SELECT min(trade_date) FROM (SELECT DISTINCT trade_date FROM bars WHERE trade_date <= ? "
        "ORDER BY trade_date DESC LIMIT ?)",
        [end.isoformat(), LIMIT_WINDOW],
    ).fetchall()[0][0]
    query = SCREEN_SQL
    if where:
        query += " WHERE " + " AND ".join(where)
    query += " ORDER BY (d.close / d.preclose - 1) DESC, d.symbol"

    rows = conn.execute(
        query,
        [end.isoformat(), not exclude_st, end.isoformat(), window_start, end.isoformat(), *params],
    ).fetchall()
    excluded = _excluded(conn, end) if exclude_st else {}
    return ScreenResult(
        meta=DataMeta(as_of=end, updated_at=updated_at, snapshot_id=snapshot_id, level="ok"),
        rows=tuple(
            _screen_row(row, meta) for row in rows
        ),
        excluded=excluded,
    )


def options(conn: Connection, *, snapshot_id: str, updated_at: datetime) -> ScreenOptions:
    end = fetch_latest_session(conn)
    if end is None:
        raise ValueError("bars is empty; cannot describe screen options")
    return ScreenOptions(
        meta=DataMeta(as_of=end, updated_at=updated_at, snapshot_id=snapshot_id, level="ok"),
        unavailable=tuple(UNAVAILABLE.values()),
    )


def _excluded(conn: Connection, trade_date: date) -> dict[str, int]:
    rows = conn.execute(
        'SELECT count(*) FROM bars WHERE trade_date = ? AND is_st = 1 AND is_trading',
        [trade_date.isoformat()],
    ).fetchall()
    st = int(rows[0][0]) if rows else 0
    return {"st": st} if st else {}


def _screen_row(row, meta: Mapping[str, InstrumentsMetaEntry] | None) -> ScreenRow:
    """One screen row plus whatever the optional metadata file knows about it."""
    entry = meta.get(str(row[0])) if meta else None
    return ScreenRow(
        code=str(row[0]),
        name=entry.name if entry else None,
        price=float(row[1]),
        chg_pct=float(row[2]),
        turnover_pct=float(row[3]) if row[3] is not None else None,
        amount=float(row[4]),
        ladder=int(row[5]),
        limit_20=int(row[6]),
        industry=entry.industry if entry else None,
        industry_status=entry.status if entry else None,
    )
