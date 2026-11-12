"""Offline coverage for the optional instruments_meta join.

The metadata file is optional: None means "no file at all" and must never read as
"the source has no record". These tests build real parquet files in a temp directory
and read them through duckdb, so nothing here fakes the read path.
"""

import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest import mock

import pyarrow as pa
import pyarrow.parquet as pq
from fastapi.testclient import TestClient

from quant_workbench.api.app import create_app
from quant_workbench.api.contracts import ScreenRow, StockDetail
from quant_workbench.api.repository import (
    INSTRUMENTS_META_STATUSES,
    fetch_instruments_meta,
)
from quant_workbench.api.screen_service import screen
from quant_workbench.api.stock_service import build_stock

SNAPSHOT = "baostock:2010-01-04..2026-11-11|pkg:2026-11-08|factor:mixed-tushare-v1+inc:2026-11-11"
UPDATED = datetime(2026, 11, 11, 19, 12, tzinfo=timezone.utc)
DAY = date(2026, 11, 11)
SCHEMA = pa.schema([("symbol", pa.string()), ("name", pa.string()), ("industry", pa.string()),
                    ("industry_status", pa.string()), ("name_as_of", pa.date32())])


def write_meta(directory: str, rows) -> str:
    path = str(Path(directory, "instruments_meta.parquet"))
    pq.write_table(pa.Table.from_pylist(rows, schema=SCHEMA), path)
    return path


class FakeConnection:
    """Returns canned rows; the services do the ordering, this only answers queries."""

    def __init__(self, bars, *, board="Main", streak=(0, 0), latest=DAY, screen_rows=None):
        self.bars = bars
        self.board = board
        self.streak = streak
        self.latest = latest
        self.screen_rows = screen_rows or []
        self.closed = False

    def execute(self, query, parameters=None):
        if "FROM limit_streaks" in query and "GROUP BY symbol" not in query:
            rows = [self.streak]
        elif "is_st = 1" in query:
            rows = [(0,)]
        elif "min(trade_date)" in query:
            rows = [("2026-11-06",)]
        elif "max(trade_date)" in query:
            rows = [(self.latest.isoformat() if self.latest else None,)]
        elif "SELECT board FROM instruments" in query:
            rows = [(self.board,)]
        elif "SELECT symbol FROM instruments WHERE symbol = ?" in query:
            rows = [(parameters[0],)] if parameters[0].startswith("SH") else []
        elif "FROM data_quality" in query:
            rows = [("snapshot-abc", "2026-11-11T19:12:09+00:00")]
        elif "WITH day" in query:
            rows = self.screen_rows
        elif "FROM bars" in query:
            rows = self.bars
        else:
            rows = []
        return _Result(rows)

    def close(self) -> None:
        self.closed = True


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return list(self._rows)


def bar_row(symbol, day, close, preclose, *, turn=1.5, is_st=False):
    """One stored bar row: trade_date is a VARCHAR in the database, not a date."""
    return (symbol, day.isoformat(), preclose, close + 0.2, preclose - 0.2, close, preclose,
            1000.0, 1.0e7, turn, is_st, True)


SCREEN_ROWS = [("SH600000", 10.0, 1.01, 1.5, 1.0e7, 0, 0),
               ("SZ000022", 20.0, -0.5, 2.0, 2.0e7, 0, 0)]



class MissingMetadataTest(unittest.TestCase):
    def test_no_file_returns_none(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertIsNone(fetch_instruments_meta(str(Path(directory, "absent.parquet"))))

    def test_blank_path_returns_none(self):
        self.assertIsNone(fetch_instruments_meta(""))

    def test_stock_detail_keeps_metadata_fields_none(self):
        detail = build_stock(FakeConnection([bar_row("SH600000", DAY, 10.0, 9.9)]),
                             "SH600000", DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED, meta=None)
        self.assertIsInstance(detail, StockDetail)
        self.assertIsNone(detail.name)
        self.assertIsNone(detail.industry)
        self.assertIsNone(detail.industry_status)

    def test_screen_rows_keep_metadata_fields_none(self):
        result = screen(FakeConnection([], screen_rows=SCREEN_ROWS), [], DAY, snapshot_id=SNAPSHOT,
                        updated_at=UPDATED, meta=None)
        self.assertEqual(len(result.rows), 2)
        for row in result.rows:
            self.assertIsInstance(row, ScreenRow)
            self.assertIsNone(row.name)
            self.assertIsNone(row.industry)
            self.assertIsNone(row.industry_status)


class MetadataPresentTest(unittest.TestCase):
    def test_reader_returns_rows_and_validates_status(self):
        with tempfile.TemporaryDirectory() as directory:
            path = write_meta(directory, [
                {"symbol": "SH600000", "name": "浦发银行", "industry": "J66货币金融服务",
                 "industry_status": "ok", "name_as_of": date(2026, 11, 11)},
                {"symbol": "SZ000022", "name": None, "industry": None,
                 "industry_status": "empty_for_delisted", "name_as_of": None},
            ])
            meta = fetch_instruments_meta(path)
        self.assertEqual(set(meta), {"SH600000", "SZ000022"})
        self.assertEqual(meta["SH600000"].name, "浦发银行")
        self.assertEqual(meta["SH600000"].industry, "J66货币金融服务")
        self.assertEqual(meta["SH600000"].status, "ok")
        self.assertIsNone(meta["SZ000022"].industry)
        self.assertEqual(meta["SZ000022"].status, "empty_for_delisted")

    def test_unknown_status_is_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            path = write_meta(directory, [
                {"symbol": "SH600000", "name": "x", "industry": None,
                 "industry_status": "probably_fine", "name_as_of": None}])
            with self.assertRaises(ValueError) as caught:
                fetch_instruments_meta(path)
        self.assertIn("probably_fine", str(caught.exception))

    def test_every_documented_status_is_accepted(self):
        rows = [{"symbol": f"SH60000{index}", "name": None, "industry": None,
                 "industry_status": status, "name_as_of": None}
                for index, status in enumerate(sorted(INSTRUMENTS_META_STATUSES))]
        with tempfile.TemporaryDirectory() as directory:
            meta = fetch_instruments_meta(write_meta(directory, rows))
        self.assertEqual({entry.status for entry in meta.values()}, INSTRUMENTS_META_STATUSES)

    def test_stock_detail_carries_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            meta = fetch_instruments_meta(write_meta(directory, [
                {"symbol": "SH600000", "name": "浦发银行", "industry": "J66货币金融服务",
                 "industry_status": "ok", "name_as_of": None}]))
        detail = build_stock(FakeConnection([bar_row("SH600000", DAY, 10.0, 9.9)]), "SH600000", DAY,
                             snapshot_id=SNAPSHOT, updated_at=UPDATED, meta=meta)
        self.assertEqual(detail.name, "浦发银行")
        self.assertEqual(detail.industry, "J66货币金融服务")
        self.assertEqual(detail.industry_status, "ok")

    def test_screen_rows_carry_metadata_per_symbol(self):
        with tempfile.TemporaryDirectory() as directory:
            meta = fetch_instruments_meta(write_meta(directory, [
                {"symbol": "SH600000", "name": "浦发银行", "industry": "J66货币金融服务",
                 "industry_status": "ok", "name_as_of": None},
                {"symbol": "SZ000022", "name": "深赤湾A", "industry": "",
                 "industry_status": "empty_for_delisted", "name_as_of": None}]))
        result = screen(FakeConnection([], screen_rows=SCREEN_ROWS), [], DAY, snapshot_id=SNAPSHOT,
                        updated_at=UPDATED, meta=meta)
        by_code = {row.code: row for row in result.rows}
        self.assertEqual(by_code["SH600000"].industry, "J66货币金融服务")
        self.assertEqual(by_code["SH600000"].industry_status, "ok")
        self.assertIsNone(by_code["SZ000022"].industry)
        self.assertEqual(by_code["SZ000022"].industry_status, "empty_for_delisted")

    def test_status_is_preserved_even_when_industry_is_empty(self):
        with tempfile.TemporaryDirectory() as directory:
            meta = fetch_instruments_meta(write_meta(directory, [
                {"symbol": "SH600000", "name": "浦发银行", "industry": None,
                 "industry_status": "missing_basic", "name_as_of": None},
                {"symbol": "SZ000022", "name": None, "industry": None,
                 "industry_status": "missing", "name_as_of": None}]))
        detail = build_stock(FakeConnection([bar_row("SH600000", DAY, 10.0, 9.9)]), "SH600000", DAY,
                             snapshot_id=SNAPSHOT, updated_at=UPDATED, meta=meta)
        self.assertEqual(detail.industry_status, "missing_basic")
        self.assertIsNone(detail.industry)
        self.assertEqual(detail.name, "浦发银行")

    def test_symbol_absent_from_an_existing_file_stays_unknown(self):
        """A file that does not mention a symbol is not evidence about the source."""
        with tempfile.TemporaryDirectory() as directory:
            meta = fetch_instruments_meta(write_meta(directory, [
                {"symbol": "SH600000", "name": "浦发银行", "industry": "J66货币金融服务",
                 "industry_status": "ok", "name_as_of": None}]))
            detail = build_stock(FakeConnection([bar_row("SZ000001", DAY, 11.0, 10.9)]), "SZ000001",
                                 DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED, meta=meta)
        self.assertIsNone(detail.name)
        self.assertIsNone(detail.industry)
        self.assertIsNone(detail.industry_status)


class EndpointWiringTest(unittest.TestCase):
    """The two endpoints must actually carry the fields, not just the services."""

    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)

    def meta_path(self, rows) -> str:
        return write_meta(self.directory.name, rows)

    def client(self, conn) -> TestClient:
        return TestClient(create_app(connect=lambda: conn, allow_anonymous=True))

    def test_stock_endpoint_returns_name_industry_and_status(self) -> None:
        path = self.meta_path([{"symbol": "SH600000", "name": "浦发银行",
                                "industry": "J66货币金融服务", "industry_status": "ok",
                                "name_as_of": None}])
        conn = FakeConnection([bar_row("SH600000", DAY, 10.0, 9.9)])
        with mock.patch("quant_workbench.api.repository.INSTRUMENTS_META_PATH", path):
            response = self.client(conn).get(f"/api/stocks/SH600000?date={DAY}")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["name"], "浦发银行")
        self.assertEqual(body["industry"], "J66货币金融服务")
        self.assertEqual(body["industry_status"], "ok")

    def test_stock_endpoint_reports_null_status_without_a_metadata_file(self) -> None:
        conn = FakeConnection([bar_row("SH600000", DAY, 10.0, 9.9)])
        with mock.patch("quant_workbench.api.repository.INSTRUMENTS_META_PATH",
                        str(Path(self.directory.name, "absent.parquet"))):
            response = self.client(conn).get(f"/api/stocks/SH600000?date={DAY}")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIsNone(body["name"])
        self.assertIsNone(body["industry"])
        self.assertIsNone(body["industry_status"])

    def test_screen_endpoint_returns_status_per_row(self) -> None:
        path = self.meta_path([{"symbol": "SH600000", "name": "浦发银行",
                                "industry": "J66货币金融服务", "industry_status": "ok",
                                "name_as_of": None}])
        conn = FakeConnection([], screen_rows=SCREEN_ROWS)
        with mock.patch("quant_workbench.api.repository.INSTRUMENTS_META_PATH", path):
            response = self.client(conn).post("/api/screen", json={"date": str(DAY)})
        self.assertEqual(response.status_code, 200)
        rows = {row["code"]: row for row in response.json()["rows"]}
        self.assertEqual(rows["SH600000"]["industry"], "J66货币金融服务")
        self.assertEqual(rows["SH600000"]["industry_status"], "ok")
        self.assertIsNone(rows["SZ000022"]["industry_status"])


if __name__ == "__main__":
    unittest.main()
