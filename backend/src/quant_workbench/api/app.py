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
from fastapi.responses import JSONResponse

from .repository import Connection, fetch_latest_snapshot, fetch_quality_checks
from .repository import resolve_symbol
from decimal import Decimal, InvalidOperation

from .backtest_service import STRATEGIES, run as run_backtest_job
from .review_service import build_review
from .screen_service import options as screen_options, screen
from .stock_service import build_stock
from .serialize import to_jsonable

DEFAULT_DB_PATH = os.environ.get("QW_DB_PATH", "data/duckdb/ingest.duckdb")
OPEN_PATHS = frozenset({"/health"})


def create_app(
    connect: Callable[[], Connection] | None = None,
    *,
    api_token: str | None = None,
    allow_anonymous: bool | None = None,
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
    opener = connect or _duckdb_opener(DEFAULT_DB_PATH)

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
            )
        except KeyError as error:
            # Unknown code and a code with no stored bars are the same answer to the caller.
            raise HTTPException(status_code=404, detail={"code": "UNKNOWN_SYMBOL", "message": code}) from error
        except ValueError as error:
            raise HTTPException(status_code=422, detail={"code": "DATA_ERROR", "message": str(error)}) from error
        finally:
            conn.close()
        return JSONResponse(content=to_jsonable(payload))

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
            )
        except ValueError as error:
            raise HTTPException(status_code=422, detail={"code": "INVALID_SCREEN", "message": str(error)}) from error
        finally:
            conn.close()
        return JSONResponse(content=to_jsonable(payload))

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


def _duckdb_opener(path: str) -> Callable[[], Connection]:
    def open_connection() -> Connection:
        import duckdb

        return duckdb.connect(path, read_only=True, config={"memory_limit": "900MB"})

    return open_connection
