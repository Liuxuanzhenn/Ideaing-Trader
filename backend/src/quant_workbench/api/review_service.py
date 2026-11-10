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

from .contracts import EMPTY, OK, Breadth, DataMeta, LimitStats, Review
from .repository import Connection, fetch_first_trade_dates, fetch_session_bars, fetch_sessions


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
    if suspended:
        excluded["suspended"] = suspended
    if st_rows:
        excluded["st"] = st_rows

    stats = limit_stats(counted, new_listing_symbols=new_listing)
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
