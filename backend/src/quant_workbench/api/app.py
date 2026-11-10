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

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse

from .repository import Connection, fetch_latest_snapshot, fetch_quality_checks
from .review_service import build_review
from .serialize import to_jsonable

DEFAULT_DB_PATH = os.environ.get("QW_DB_PATH", "data/duckdb/ingest.duckdb")


def create_app(connect: Callable[[], Connection] | None = None) -> FastAPI:
    app = FastAPI(title="Quant Workbench", version="0.1.0")
    opener = connect or _duckdb_opener(DEFAULT_DB_PATH)

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
