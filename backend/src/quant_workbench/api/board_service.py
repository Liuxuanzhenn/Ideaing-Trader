"""Board and dragon-tiger reads.

Both datasets are optional views: when the view is missing the endpoint answers `empty`
instead of failing, because "we never ingested this" and "this session has no rows" are
different facts that must not both look like a 500.
"""
from __future__ import annotations

from datetime import date, datetime

from .contracts import (
    BoardList,
    BoardRow,
    DataMeta,
    DragonTigerList,
    DragonTigerRow,
    StockBoard,
)
from .repository import (
    BOARD_TYPE_ORDER,
    Connection,
    fetch_boards,
    fetch_dragon_tiger,
    fetch_fetch_log,
    fetch_stock_boards,
)

PRICE_DECIMALS = 4
"""Percentages are reported to 4 decimals: 5.6377801581718385 costs 18 bytes a row over a
slow link and adds no information a trader can use."""


def _pct(value) -> float | None:
    return None if value is None else round(float(value), PRICE_DECIMALS)


def build_boards(conn: Connection, trade_date: date, *, snapshot_id: str,
                 updated_at: datetime, board_type: str | None = None) -> BoardList:
    rows = fetch_boards(conn, trade_date)
    meta = DataMeta(as_of=trade_date, updated_at=updated_at, snapshot_id=snapshot_id,
                    level="ok" if rows else "empty")
    if not rows:
        return BoardList(meta=meta, rows=(), status="empty")
    boards = [
        BoardRow(code=str(code), name=str(name), type=str(kind), pct_chg_ew=_pct(pct),
                 up_count=int(up), down_count=int(down), flat_count=int(flat),
                 leader_symbol=None if leader is None else str(leader),
                 leader_name=None if leader_name is None else str(leader_name),
                 member_count=int(members), valid_count=int(valid))
        for code, name, kind, pct, up, down, flat, leader, leader_name, members, valid in rows
    ]
    if board_type:
        boards = [board for board in boards if board.type == board_type]
    boards.sort(key=lambda board: (BOARD_TYPE_ORDER.get(board.type, 99),
                                   -(board.pct_chg_ew or float("-inf")), board.code))
    return BoardList(meta=meta, rows=tuple(boards))


def stock_boards(conn: Connection, symbol: str) -> tuple[StockBoard, ...] | None:
    """None means the board dataset is not wired up (or the symbol has no membership row).

    The 278 instruments without any membership currently answer None rather than ():
    we cannot claim "belongs to no board" when the loader has no row for them either.
    """
    rows = fetch_stock_boards(conn, symbol)
    if not rows:
        return None
    return tuple(StockBoard(code=str(code), name=str(name), type=str(kind))
                 for code, name, kind in rows)


def build_dragon_tiger(conn: Connection, trade_date: date, *, snapshot_id: str,
                       updated_at: datetime, exclude_bj: bool = True) -> DragonTigerList:
    rows = fetch_dragon_tiger(conn, trade_date)
    meta = DataMeta(as_of=trade_date, updated_at=updated_at, snapshot_id=snapshot_id,
                    level="ok" if rows else "empty")
    if not rows:
        # No rows can mean three different things; only fetch_log knows which.
        record = fetch_fetch_log(conn, "dragon_tiger", trade_date)
        if record is None:
            return DragonTigerList(meta=meta, rows=(), status="not_collected", excluded_bj=0)
        logged_status, _, message = record
        if logged_status == "failed":
            return DragonTigerList(meta=meta, rows=(), status="failed", excluded_bj=0,
                                   error=message or "collector reported a failure")
        return DragonTigerList(meta=meta, rows=(), status="empty", excluded_bj=0)
    excluded = 0
    kept: list[DragonTigerRow] = []
    for (trade_id, symbol, secucode, name, market, close, chg_pct, turnover, billboard,
         buy, sell, net, ratio, mcap, reason, reason_text) in rows:
        is_bj = str(secucode).endswith(".BJ")
        if exclude_bj and is_bj:
            excluded += 1
            continue
        kept.append(DragonTigerRow(
            trade_id=str(trade_id), symbol=None if symbol is None else str(symbol),
            secucode=str(secucode), name=None if name is None else str(name),
            market=None if market is None else str(market),
            close=None if close is None else float(close),
            chg_pct=_pct(chg_pct),
            turnover_rate=None if turnover is None else float(turnover),
            billboard_amt=None if billboard is None else float(billboard),
            buy_amt=None if buy is None else float(buy),
            sell_amt=None if sell is None else float(sell),
            net_amt=None if net is None else float(net),
            deal_amt_ratio=_pct(ratio),
            free_mcap=None if mcap is None else float(mcap),
            reason=str(reason or ""), reason_text=str(reason_text or "")))
    return DragonTigerList(meta=meta, rows=tuple(kept), excluded_bj=excluded)
