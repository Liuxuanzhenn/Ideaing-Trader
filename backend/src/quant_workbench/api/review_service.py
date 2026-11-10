"""Assembles the review payload from one session's bars.

Counting is done in Python rather than SQL because price limits depend on board,
ST state and the listing window; duplicating that logic in SQL would create a
second set of rules that drifts from the first.

ST stocks are excluded by default for this version, so `excluded` must always say
how many rows were dropped and why. A statistic that silently shrinks its own
sample is worse than a wrong one.
"""

from __future__ import annotations

from datetime import date, datetime

from quant_workbench.data import DailyBar
from quant_workbench.market.calendar import TradingCalendar
from quant_workbench.market.limits import NEW_LISTING_SESSIONS, is_st_effective
from quant_workbench.market.review import breadth, limit_stats

from .contracts import (
    EMPTY,
    OK,
    Breadth,
    DataMeta,
    IndexQuote,
    IndexSeries,
    LadderEntry,
    LimitStats,
    MarketExtra,
    PrevLimitPerformance,
    PromotionStep,
    Review,
    SessionPoint,
    SessionSeries,
)
from .repository import (
    Connection,
    fetch_first_trade_dates,
    fetch_index_closes,
    fetch_index_quotes,
    fetch_ladder,
    fetch_prev_limit_changes,
    fetch_previous_session,
    fetch_promotion,
    fetch_session_amount,
    fetch_null_price_count,
    fetch_session_bars,
    fetch_session_stats,
    fetch_sessions,
)

LADDER_MIN_STREAK = 2
SERIES_SESSIONS = 20


def build_review(
    conn: Connection,
    trade_date: date,
    *,
    snapshot_id: str,
    updated_at: datetime,
    exclude_st: bool = True,
) -> Review:
    """Build the payload; `updated_at` is the pipeline's timestamp, not now()."""
    bars = fetch_session_bars(conn, trade_date)
    if not bars:
        return Review(
            meta=_meta(trade_date, EMPTY, snapshot_id, updated_at),
            is_trading_day=False,
            breadth=Breadth(up=0, down=0, flat=0),
            limits=LimitStats(sealed_up=0, broken_up=0, sealed_down=0, no_limit=0),
            excluded={},
        )

    new_listing = _new_listing_symbols(conn, trade_date)
    suspended = 0
    st_rows = 0
    counted: list[DailyBar] = []
    for bar in bars:
        if not bar.trading:
            suspended += 1
            continue
        in_st = is_st_effective(bar)
        if exclude_st and in_st:
            st_rows += 1
            continue
        counted.append(bar)
    excluded = {}
    no_price = fetch_null_price_count(conn, trade_date)
    if no_price:
        excluded["no_price"] = no_price
    if suspended:
        excluded["suspended"] = suspended
    if st_rows:
        excluded["st"] = st_rows

    stats = limit_stats(counted, new_listing_symbols=new_listing)
    indices = tuple(
        IndexQuote(code=code, name=name, close=float(close), chg_pct=float(chg), amount=float(amount))
        for code, name, close, chg, amount in fetch_index_quotes(conn, trade_date)
    )
    ladder = tuple(
        LadderEntry(symbol=symbol, streak=int(streak), is_one_word=bool(one_word))
        for symbol, streak, one_word in fetch_ladder(conn, trade_date, LADDER_MIN_STREAK)
    )
    return Review(
        meta=_meta(trade_date, OK, snapshot_id, updated_at),
        is_trading_day=True,
        breadth=_breadth(counted),
        limits=LimitStats(
            sealed_up=stats.sealed_up,
            broken_up=stats.broken_up,
            sealed_down=stats.sealed_down,
            no_limit=stats.no_limit,
            out_of_band=stats.out_of_band,
        ),
        excluded=excluded,
        indices=indices,
        ladder=ladder,
        series=_series(conn, trade_date),
        market=_market(conn, trade_date),
    )


def _new_listing_symbols(conn: Connection, trade_date: date) -> frozenset[str]:
    """Symbols still inside the no-limit window of their first sessions."""
    sessions = fetch_sessions(conn)
    if not sessions:
        return frozenset()
    calendar = TradingCalendar.from_open_days(sessions)
    first_dates = fetch_first_trade_dates(conn)
    inside = []
    for symbol, first_date in first_dates.items():
        number = calendar.listed_session_number(first_date, trade_date)
        if number is not None and number <= NEW_LISTING_SESSIONS:
            inside.append(symbol)
    return frozenset(inside)


def _breadth(bars: list[DailyBar]) -> Breadth:
    result = breadth(bars)
    return Breadth(up=result.up, down=result.down, flat=result.flat)


def _meta(trade_date: date, level: str, snapshot_id: str, updated_at: datetime) -> DataMeta:
    return DataMeta(
        as_of=trade_date,
        updated_at=updated_at,
        snapshot_id=snapshot_id,
        level=level,
    )


def _series(conn: Connection, trade_date: date) -> SessionSeries:
    """Trailing aggregates for the sparklines.

    The numbers come from the precomputed `session_stats` table so a 20-day window
    costs one small read. If that table is missing or shorter than the window, the
    series is simply shorter - an empty chart must not be filled with made-up points.
    """
    rows = fetch_session_stats(conn, trade_date, SERIES_SESSIONS)
    if not rows:
        return SessionSeries()
    points = [
        SessionPoint(
            trade_date=date.fromisoformat(str(row[0])),
            up=int(row[1]),
            down=int(row[2]),
            flat=int(row[3]),
            sealed_up=int(row[4]),
            broken_up=int(row[5]),
            sealed_down=int(row[6]),
            touched_up=int(row[7]),
            seal_rate=float(row[8]) if row[8] is not None else None,
            max_ladder=int(row[9]),
            ladder_count=int(row[10]),
            amount=float(row[11]),
        )
        for row in rows
    ]
    return SessionSeries(
        dates=tuple(point.trade_date for point in points),
        sealed_up=tuple(point.sealed_up for point in points),
        sealed_down=tuple(point.sealed_down for point in points),
        broken_up=tuple(point.broken_up for point in points),
        seal_rate=tuple(point.seal_rate for point in points),
        red_ratio=tuple(
            point.up / (point.up + point.down + point.flat) if (point.up + point.down + point.flat) else None
            for point in points
        ),
        max_ladder=tuple(point.max_ladder for point in points),
        ladder_count=tuple(point.ladder_count for point in points),
        amount=tuple(point.amount for point in points),
        indices=_index_series(conn, points),
    )


def _index_series(conn: Connection, points: list[SessionPoint]) -> tuple[IndexSeries, ...]:
    """Index closes aligned to the session dates; a gap stays None rather than being carried."""
    rows = fetch_index_closes(conn, points[0].trade_date, points[-1].trade_date)
    by_code: dict[str, tuple[str, dict[str, float]]] = {}
    for code, name, stored_date, close in rows:
        entry = by_code.setdefault(code, (name, {}))
        entry[1][str(stored_date)] = float(close)
    return tuple(
        IndexSeries(
            code=code,
            name=name,
            closes=tuple(closes.get(point.trade_date.isoformat()) for point in points),
        )
        for code, (name, closes) in sorted(by_code.items())
    )


def _market(conn: Connection, trade_date: date) -> MarketExtra:
    """Turnover, promotion rates and how yesterday's limit-ups fared today."""
    previous = fetch_previous_session(conn, trade_date)
    if previous is None:
        return MarketExtra(amount=fetch_session_amount(conn, trade_date))
    steps = tuple(
        PromotionStep(level=level, base=base, promoted=promoted)
        for level, base, promoted in fetch_promotion(conn, previous, trade_date)
    )
    changes = fetch_prev_limit_changes(conn, previous, trade_date)
    return MarketExtra(
        amount=fetch_session_amount(conn, trade_date),
        promotion=steps,
        prev_limit=_prev_limit(changes),
    )


def _prev_limit(changes: list[float]) -> PrevLimitPerformance | None:
    """Median and share that closed green; None when no sample survived."""
    if not changes:
        return None
    ordered = sorted(changes)
    middle = len(ordered) // 2
    median = ordered[middle] if len(ordered) % 2 else (ordered[middle - 1] + ordered[middle]) / 2
    return PrevLimitPerformance(
        samples=len(ordered),
        median_pct=median,
        up_ratio=sum(1 for value in ordered if value > 0) / len(ordered),
    )
