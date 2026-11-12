"""HTTP surface for the workbench.

Only the review endpoint and the data-status listing exist so far. The connection
is opened per request and closed in a `finally`: duckdb connections are not safe to
share across threads, and a leaked handle keeps the database locked.

`updated_at` always comes from the recorded quality snapshot, never from the clock,
so a stale dataset can never look fresh to the UI.
"""

from __future__ import annotations

import os
from datetime import date
from typing import Callable

from fastapi import FastAPI, HTTPException, Query, Request
from starlette.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from .repository import Connection, fetch_latest_snapshot, fetch_quality_checks
from .repository import fetch_instruments_meta, resolve_symbol
from decimal import Decimal, InvalidOperation

from .backtest_service import STRATEGIES, run as run_backtest_job
from .portfolio_store import PortfolioStore
from .review_service import build_review
from .screen_service import options as screen_options, screen
from .stock_service import build_stock
from .board_service import build_boards, build_dragon_tiger, stock_boards
from .serialize import to_jsonable

DEFAULT_DB_PATH = os.environ.get("QW_DB_PATH", "data/duckdb/ingest.duckdb")
OPEN_PATHS = frozenset({"/health"})


def create_app(
    connect: Callable[[], Connection] | None = None,
    *,
    api_token: str | None = None,
    allow_anonymous: bool | None = None,
    portfolio: PortfolioStore | None = None,
) -> FastAPI:
    """Build the app. Without a token, requests are refused unless anonymity is
    explicitly enabled, because this service reads private research data and has no
    user model to fall back on.

    Both settings fall back to the environment so an ASGI factory can build the app
    without arguments; an explicit argument always wins over the environment.
    """
    token = api_token if api_token is not None else os.environ.get("QW_API_TOKEN") or None
    anonymous = (
        allow_anonymous
        if allow_anonymous is not None
        else os.environ.get("QW_ALLOW_ANONYMOUS") == "1"
    )
    app = FastAPI(title="Quant Workbench", version="0.1.0")
    # /api/boards answers ~240 KB of JSON; the tunnel to this box runs at ~344 ms RTT, where
    # that payload takes tens of seconds. gzip is built into starlette, so this costs nothing.
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    opener = connect or _duckdb_opener(DEFAULT_DB_PATH)
    lists = portfolio or PortfolioStore()

    @app.middleware("http")
    async def require_token(request: Request, call_next):
        if request.url.path in OPEN_PATHS:
            return await call_next(request)
        if token:
            header = request.headers.get("authorization", "")
            if header != f"Bearer {token}":
                return JSONResponse(
                    status_code=401,
                    content={"code": "UNAUTHORIZED", "message": "missing or wrong bearer token"},
                )
        elif not anonymous:
            return JSONResponse(
                status_code=503,
                content={
                    "code": "NO_TOKEN_CONFIGURED",
                    "message": "set QW_API_TOKEN, or QW_ALLOW_ANONYMOUS=1 for local use",
                },
            )
        return await call_next(request)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/review")
    def review(
        date_param: str = Query(alias="date", description="交易日 YYYY-MM-DD"),
        exclude_st: bool = Query(default=True, alias="exclude_st"),
    ) -> JSONResponse:
        try:
            trade_date = date.fromisoformat(date_param)
        except ValueError as error:
            raise HTTPException(status_code=400, detail={"code": "INVALID_DATE", "message": date_param}) from error
        conn = opener()
        try:
            snapshot_id, updated_at = fetch_latest_snapshot(conn)
            payload = build_review(
                conn,
                trade_date,
                snapshot_id=snapshot_id,
                updated_at=updated_at,
                exclude_st=exclude_st,
            )
        except ValueError as error:
            raise HTTPException(status_code=422, detail={"code": "DATA_ERROR", "message": str(error)}) from error
        finally:
            conn.close()
        return JSONResponse(content=to_jsonable(payload))

    @app.get("/api/stocks/{code}")
    def stock(code: str, date_param: str | None = Query(default=None, alias="date")) -> JSONResponse:
        trade_date = None
        if date_param is not None:
            try:
                trade_date = date.fromisoformat(date_param)
            except ValueError as error:
                raise HTTPException(status_code=400, detail={"code": "INVALID_DATE", "message": date_param}) from error
        conn = opener()
        try:
            snapshot_id, updated_at = fetch_latest_snapshot(conn)
            payload = build_stock(
                conn,
                resolve_symbol(conn, code),
                trade_date,
                snapshot_id=snapshot_id,
                updated_at=updated_at,
                meta=fetch_instruments_meta(),
                boards=stock_boards(conn, resolve_symbol(conn, code)),
            )
        except KeyError as error:
            # Unknown code and a code with no stored bars are the same answer to the caller.
            raise HTTPException(status_code=404, detail={"code": "UNKNOWN_SYMBOL", "message": code}) from error
        except ValueError as error:
            raise HTTPException(status_code=422, detail={"code": "DATA_ERROR", "message": str(error)}) from error
        finally:
            conn.close()
        return JSONResponse(content=to_jsonable(payload))


    @app.get("/api/boards")
    def boards(date_param: str = Query(alias="date", description="交易日 YYYY-MM-DD"),
               type_param: str | None = Query(default=None, alias="type")) -> JSONResponse:
        try:
            trade_date = date.fromisoformat(date_param)
        except ValueError as error:
            raise HTTPException(status_code=400, detail={"code": "INVALID_DATE", "message": date_param}) from error
        if type_param is not None and type_param not in ("region", "industry", "concept", "style"):
            raise HTTPException(status_code=400,
                                detail={"code": "INVALID_TYPE", "message": type_param})
        conn = opener()
        try:
            snapshot_id, updated_at = fetch_latest_snapshot(conn)
            payload = build_boards(conn, trade_date, snapshot_id=snapshot_id,
                                   updated_at=updated_at, board_type=type_param)
        finally:
            conn.close()
        return JSONResponse(content={
            "meta": {"as_of": trade_date.isoformat(), "updated_at": to_jsonable(updated_at),
                     "snapshot_id": payload.meta.snapshot_id, "status": payload.status},
            "rows": to_jsonable(payload.rows)})

    @app.get("/api/dragon-tiger")
    def dragon_tiger(date_param: str = Query(alias="date", description="交易日 YYYY-MM-DD"),
                     exclude_bj: bool = Query(default=True, alias="exclude_bj")) -> JSONResponse:
        try:
            trade_date = date.fromisoformat(date_param)
        except ValueError as error:
            raise HTTPException(status_code=400, detail={"code": "INVALID_DATE", "message": date_param}) from error
        conn = opener()
        try:
            snapshot_id, updated_at = fetch_latest_snapshot(conn)
            payload = build_dragon_tiger(conn, trade_date, snapshot_id=snapshot_id,
                                         updated_at=updated_at, exclude_bj=exclude_bj)
        finally:
            conn.close()
        return JSONResponse(content={
            "meta": {"trade_date": trade_date.isoformat(), "total": len(payload.rows),
                     "excluded_bj": payload.excluded_bj, "status": payload.status,
                     # so a 龙虎榜 result can be traced back to the data snapshot it came from
                     "snapshot_id": payload.meta.snapshot_id,
                     "updated_at": to_jsonable(updated_at),
                     "error": payload.error},
            "rows": to_jsonable(payload.rows)})

    @app.get("/api/backtests/options")
    def backtest_options() -> JSONResponse:
        conn = opener()
        try:
            snapshot_id, updated_at = fetch_latest_snapshot(conn)
            from .repository import fetch_latest_session

            payload = {
                "snapshot_id": snapshot_id,
                "updated_at": updated_at,
                "strategies": [{"id": key, "label": label} for key, label in STRATEGIES.items()],
                "latest_session": fetch_latest_session(conn),
            }
        finally:
            conn.close()
        return JSONResponse(content=to_jsonable(payload))

    @app.post("/api/backtests")
    async def submit_backtest(request: Request) -> JSONResponse:
        body = await request.json()
        strategy = body.get("strategy", "first_board")
        try:
            capital = Decimal(str(body.get("capital", "1000000")))
        except (InvalidOperation, ValueError) as error:
            raise HTTPException(status_code=400, detail={"code": "INVALID_CAPITAL", "message": str(body.get("capital"))}) from error
        try:
            start = date.fromisoformat(body["start"]) if body.get("start") else None
            end = date.fromisoformat(body["end"]) if body.get("end") else None
        except (KeyError, ValueError) as error:
            raise HTTPException(status_code=400, detail={"code": "INVALID_DATE", "message": str(error)}) from error
        conn = opener()
        try:
            snapshot_id, updated_at = fetch_latest_snapshot(conn)
            payload = run_backtest_job(
                conn,
                strategy=strategy,
                start=start,
                end=end,
                capital=capital,
                max_positions=int(body.get("max_positions", 10)),
                holding_days=int(body.get("holding_days", 5)),
                snapshot_id=snapshot_id,
                updated_at=updated_at,
            )
        except ValueError as error:
            raise HTTPException(status_code=422, detail={"code": "INVALID_BACKTEST", "message": str(error)}) from error
        finally:
            conn.close()
        return JSONResponse(content=to_jsonable(payload))

    @app.get("/api/screen/options")
    def screen_option_list() -> JSONResponse:
        conn = opener()
        try:
            snapshot_id, updated_at = fetch_latest_snapshot(conn)
            payload = screen_options(conn, snapshot_id=snapshot_id, updated_at=updated_at)
        except ValueError as error:
            raise HTTPException(status_code=422, detail={"code": "DATA_ERROR", "message": str(error)}) from error
        finally:
            conn.close()
        return JSONResponse(content=to_jsonable(payload))

    @app.post("/api/screen")
    async def run_screen(request: Request) -> JSONResponse:
        body = await request.json()
        conditions = body.get("conditions", [])
        if not isinstance(conditions, list):
            raise HTTPException(status_code=400, detail={"code": "INVALID_BODY", "message": "conditions must be a list"})
        date_param = body.get("date")
        trade_date = None
        if date_param is not None:
            try:
                trade_date = date.fromisoformat(date_param)
            except ValueError as error:
                raise HTTPException(status_code=400, detail={"code": "INVALID_DATE", "message": str(date_param)}) from error
        conn = opener()
        try:
            snapshot_id, updated_at = fetch_latest_snapshot(conn)
            payload = screen(
                conn,
                conditions,
                trade_date,
                snapshot_id=snapshot_id,
                updated_at=updated_at,
                meta=fetch_instruments_meta(),
            )
        except ValueError as error:
            raise HTTPException(status_code=422, detail={"code": "INVALID_SCREEN", "message": str(error)}) from error
        finally:
            conn.close()
        return JSONResponse(content=to_jsonable(payload))

    @app.get("/api/portfolio")
    def portfolio_state() -> JSONResponse:
        return JSONResponse(content=to_jsonable(lists.list()))

    @app.post("/api/portfolio/{kind}")
    async def portfolio_add(kind: str, request: Request) -> JSONResponse:
        body = await request.json()
        symbol = _normalise_symbol(opener, body.get("code"))
        try:
            return JSONResponse(content=to_jsonable(lists.add(kind, symbol)))
        except ValueError as error:
            raise HTTPException(status_code=400, detail={"code": "UNKNOWN_LIST", "message": str(error)}) from error

    @app.delete("/api/portfolio/{kind}/{code}")
    def portfolio_remove(kind: str, code: str) -> JSONResponse:
        symbol = _normalise_symbol(opener, code)
        try:
            return JSONResponse(content=to_jsonable(lists.remove(kind, symbol)))
        except ValueError as error:
            raise HTTPException(status_code=400, detail={"code": "UNKNOWN_LIST", "message": str(error)}) from error

    @app.get("/api/data-status")
    def data_status() -> JSONResponse:
        conn = opener()
        try:
            snapshot_id, updated_at = fetch_latest_snapshot(conn)
            checks = fetch_quality_checks(conn)
        except ValueError as error:
            raise HTTPException(status_code=503, detail={"code": "NO_SNAPSHOT", "message": str(error)}) from error
        finally:
            conn.close()
        warnings = [check for check in checks if check["verdict"] != "pass"]
        return JSONResponse(
            content=to_jsonable(
                {
                    "snapshot_id": snapshot_id,
                    "updated_at": updated_at,
                    "checks": checks,
                    "warning_count": len(warnings),
                }
            )
        )

    return app


def _normalise_symbol(opener: Callable[[], Connection], code: object) -> str:
    """Store the same 8-character symbol the price tables use, so a list entry can join."""
    text = str(code or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail={"code": "INVALID_CODE", "message": "code is required"})
    conn = opener()
    try:
        return resolve_symbol(conn, text)
    except KeyError as error:
        raise HTTPException(status_code=404, detail={"code": "UNKNOWN_SYMBOL", "message": text}) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail={"code": "INVALID_CODE", "message": str(error)}) from error
    finally:
        conn.close()


def _duckdb_opener(path: str) -> Callable[[], Connection]:
    def open_connection() -> Connection:
        import duckdb

        return duckdb.connect(path, read_only=True, config={"memory_limit": "900MB"})

    return open_connection
