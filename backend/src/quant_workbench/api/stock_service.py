"""Assembles one instrument's detail payload.

Prices come back raw (not adjusted) because the factor change table lives outside
this database; the payload says so in `price_adjustment` instead of labelling raw
prices as 前复权.

Limit statistics come from the precomputed `limit_streaks` table so this endpoint
stays a handful of index reads instead of reclassifying hundreds of bars per call.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Mapping

from quant_workbench.data import DailyBar
from quant_workbench.market.review import low_open_high_close

from .contracts import (
    Candle,
    DataMeta,
    LowOpenStats,
    StockDetail,
    StockStats,
)
from .repository import (
    Connection,
    InstrumentsMetaEntry,
    fetch_latest_session,
    fetch_symbol_board,
    fetch_symbol_history,
    fetch_symbol_streaks,
)

CANDLE_SESSIONS = 250
CHG_20D_OFFSET = 20
LOW_OPEN_WINDOW = 250
LOW_OPEN_VERSION = "low_open_high_close/v1"
LOW_OPEN_GAP = Decimal("0.002")
PRICE_ADJUSTMENT = "raw"


def build_stock(
    conn: Connection,
    code: str,
    trade_date: date | None,
    *,
    snapshot_id: str,
    updated_at: datetime,
    meta: Mapping[str, InstrumentsMetaEntry] | None = None,
    boards: tuple | None = None,
) -> StockDetail:
    """`trade_date` defaults to the newest stored session; never the clock.

    `meta` is the optional instruments_meta mapping: None means no metadata file, so
    name/industry/industry_status stay None rather than claiming an absent record.
    """
    end = trade_date or fetch_latest_session(conn)
    if end is None:
        raise ValueError("bars is empty; cannot build a stock view")
    symbol = code
    bars = fetch_symbol_history(conn, symbol, end, CANDLE_SESSIONS)
    if not bars:
        raise KeyError(symbol)

    board = fetch_symbol_board(conn, symbol) or ""
    last = bars[-1]
    trading_bars = [bar for bar in bars if bar.trading]
    latest = trading_bars[-1] if trading_bars else None
    window_start = bars[0].trade_date
    limit_count, max_ladder = fetch_symbol_streaks(conn, symbol, window_start, end)

    low_open = low_open_high_close(trading_bars, gap=LOW_OPEN_GAP)
    entry = meta.get(symbol) if meta else None
    return StockDetail(
        meta=DataMeta(
            as_of=end,
            updated_at=updated_at,
            snapshot_id=snapshot_id,
            level="ok" if latest is not None else "empty",
        ),
        code=symbol,
        name=entry.name if entry else None,
        board=board,
        trade_status=_trade_status(latest, bars),
        price=float(latest.close) if latest else None,
        chg_pct=_chg_pct(latest),
        turnover_pct=float(latest.turn) if latest and latest.turn is not None else None,
        amount=float(latest.amount) if latest else None,
        mcap=None,
        stats=StockStats(
            chg_20d_pct=_chg_over(trading_bars, CHG_20D_OFFSET),
            low_open=LowOpenStats(
                hits=low_open.hits,
                samples=low_open.samples,
                window=min(LOW_OPEN_WINDOW, len(trading_bars)),
                version=LOW_OPEN_VERSION,
            ),
            limit_250=limit_count,
            max_ladder=max_ladder,
        ),
        candles=tuple(
            Candle(
                trade_date=bar.trade_date,
                open=float(bar.open),
                high=float(bar.high),
                low=float(bar.low),
                close=float(bar.close),
                volume=float(bar.volume),
            )
            for bar in trading_bars
        ),
        price_adjustment=PRICE_ADJUSTMENT,
        industry=entry.industry if entry else None,
        industry_status=entry.status if entry else None,
        boards=boards,
    )


def _trade_status(latest: DailyBar | None, bars: list[DailyBar]) -> str:
    if latest is None or latest.trade_date != bars[-1].trade_date:
        return "suspended"
    if latest.is_st:
        return "st"
    return "normal"


def _chg_pct(bar: DailyBar | None) -> float | None:
    if bar is None or bar.preclose is None or bar.preclose <= 0:
        return None
    return float((bar.close / bar.preclose - 1) * 100)


def _chg_over(bars: list[DailyBar], offset: int) -> float | None:
    """Change over `offset` sessions; None when the history is too short."""
    if len(bars) <= offset:
        return None
    base = bars[-1 - offset].close
    if base <= 0:
        return None
    return float((bars[-1].close / base - 1) * 100)
