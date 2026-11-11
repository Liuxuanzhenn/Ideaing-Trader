"""Runs the review service against the real database and prints JSON.

Usage (on the server, with the project on PYTHONPATH):
    python tools/probe_review.py /path/to/ingest.duckdb 2026-11-06 [more dates...]

This is a probe, not a server: it exists so the first real numbers can be checked
before any HTTP layer is written.
"""

from __future__ import annotations

import sys
from datetime import date, datetime, timezone

import duckdb

from quant_workbench.api.repository import fetch_session_bar_count
from quant_workbench.api.review_service import build_review
from quant_workbench.api.serialize import review_to_json

SNAPSHOT_SQL = """
SELECT snapshot_id, max(recorded_at)
FROM data_quality
GROUP BY snapshot_id
ORDER BY max(recorded_at) DESC
LIMIT 1
"""


def load_snapshot(conn: duckdb.DuckDBPyConnection) -> tuple[str, datetime]:
    rows = conn.execute(SNAPSHOT_SQL).fetchall()
    if not rows or rows[0][0] is None:
        raise SystemExit("data_quality has no snapshot; refusing to report unknown provenance")
    snapshot_id, recorded_at = rows[0]
    stamp = datetime.fromisoformat(str(recorded_at).replace("Z", "+00:00"))
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return str(snapshot_id), stamp


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(__doc__)
        return 2
    conn = duckdb.connect(argv[1], read_only=True, config={"memory_limit": "900MB"})
    snapshot_id, updated_at = load_snapshot(conn)
    for raw in argv[2:]:
        trade_date = date.fromisoformat(raw)
        print(f"=== {trade_date} rows={fetch_session_bar_count(conn, trade_date)}")
        review = build_review(
            conn,
            trade_date,
            snapshot_id=snapshot_id,
            updated_at=updated_at,
        )
        print(review_to_json(review))
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
