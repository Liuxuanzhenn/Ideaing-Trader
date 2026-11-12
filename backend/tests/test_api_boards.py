"""Endpoint contracts for boards and 龙虎榜: three states each (data / empty / not wired).

These views are optional in production, so "not wired" must answer empty rather than 500,
and a session with no rows must be distinguishable from one that has them.
"""

import unittest
from datetime import date, datetime, timezone

from fastapi.testclient import TestClient

from quant_workbench.api.app import create_app

DAY = "2026-11-11"
SNAPSHOT = "snap-abc"
UPDATED = "2026-11-12T08:00:00+00:00"


class FakeConnection:
    """Routes only the queries the three endpoints need; `missing` hides a dataset."""

    def __init__(self, *, boards=None, stock_board_rows=None, dragon_rows=None, missing=(),
                 fetch_log_rows=None):
        self.boards = boards
        self.stock_board_rows = stock_board_rows
        self.dragon_rows = dragon_rows
        self.missing = set(missing)
        self.fetch_log_rows = fetch_log_rows or []
        self.closed = False

    def execute(self, query, parameters=None):
        params = list(parameters or [])

        def rows_for(name):
            if name in self.missing:
                raise RuntimeError(f"Catalog Error: Table with name {name} does not exist")
            return None

        if "FROM board_daily" in query:
            rows_for("board_daily")
            rows = self.boards or []
        elif "FROM instruments_board" in query:
            rows_for("instruments_board")
            rows = self.stock_board_rows or []
        elif "FROM dragon_tiger" in query:
            rows_for("dragon_tiger")
            rows = self.dragon_rows or []
        elif "FROM fetch_log" in query:
            rows_for("fetch_log")
            rows = self.fetch_log_rows
        elif "FROM data_quality" in query:
            rows = [(SNAPSHOT, UPDATED)]
        elif "FROM instruments WHERE symbol = ?" in query or "SELECT board FROM instruments" in query:
            rows = [("Main",)]
        elif "max(trade_date)" in query:
            rows = [(DAY,)]
        elif "FROM limit_streaks" in query:
            rows = [(0, 0)]
        elif "FROM bars" in query:
            rows = [("SH600000", DAY, 10.0, 11.0, 9.9, 11.0, 10.0, 1000.0, 1.0e7, 1.5, 0, True)]
        else:
            rows = []

        class _Result:
            def fetchall(_inner):
                return rows

        return _Result()

    def close(self):
        self.closed = True


def client_for(conn):
    return TestClient(create_app(connect=lambda: conn, allow_anonymous=True))


class BoardEndpointTests(unittest.TestCase):
    def test_rows_are_grouped_by_type(self):
        conn = FakeConnection(boards=[
            ("683", "央国企改革", "concept", 0.42, 721, 606, 92, "SZ300620", "光库科技", 1451, 1419),
            ("153", "广东板块", "region", 0.9, 500, 300, 20, "SH600000", "浦发银行", 908, 820),
            ("1205", "机械设备", "industry", -0.3, 100, 200, 10, "SH600001", "白云机场", 629, 310),
        ])
        body = client_for(conn).get(f"/api/boards?date={DAY}").json()
        self.assertEqual([row["type"] for row in body["rows"]], ["region", "industry", "concept"])
        self.assertEqual(body["meta"]["status"], "ok")
        self.assertIn("pct_chg_ew", body["rows"][0])
        self.assertEqual(body["rows"][2]["valid_count"], 1419)
        self.assertEqual(body["rows"][2]["leader_name"], "光库科技")

    def test_type_filter_narrows_the_list(self):
        conn = FakeConnection(boards=[
            ("683", "央国企改革", "concept", 0.42, 1, 1, 0, "SZ300620", "光库科技", 1451, 1419),
            ("1205", "机械设备", "industry", -0.3, 1, 1, 0, "SH600001", "白云机场", 629, 310),
        ])
        body = client_for(conn).get(f"/api/boards?date={DAY}&type=industry").json()
        self.assertEqual([row["code"] for row in body["rows"]], ["1205"])

    def test_empty_day_is_empty_not_an_error(self):
        body = client_for(FakeConnection(boards=[])).get(f"/api/boards?date={DAY}").json()
        self.assertEqual(body["meta"]["status"], "empty")
        self.assertEqual(body["rows"], [])

    def test_not_wired_is_empty_too(self):
        conn = FakeConnection(missing={"board_daily"})
        response = client_for(conn).get(f"/api/boards?date={DAY}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["meta"]["status"], "empty")

    def test_unknown_type_is_refused(self):
        response = client_for(FakeConnection()).get(f"/api/boards?date={DAY}&type=sector")
        self.assertEqual(response.status_code, 400)


class DragonTigerEndpointTests(unittest.TestCase):
    def row(self, secucode, symbol, trade_id, net, name="飞亚达"):
        return (trade_id, symbol, secucode, name, "深交所主板", 23.16, 10.02, 8.4,
                6.17e8, 3.6e8, 2.5e8, net, 35.5, 8.7e9, "1家机构买入", "连续三个交易日涨幅偏离20%")

    def test_rows_come_back_and_bj_is_counted_not_dropped_silently(self):
        conn = FakeConnection(dragon_rows=[
            self.row("000026.SZ", "SZ000026", "1001", 1.1e8),
            self.row("920045.BJ", None, "1002", 5.0e7, name="蘅东光"),
        ])
        body = client_for(conn).get(f"/api/dragon-tiger?date={DAY}").json()
        self.assertEqual(body["meta"]["total"], 1)
        self.assertEqual(body["meta"]["excluded_bj"], 1)
        self.assertEqual(body["rows"][0]["symbol"], "SZ000026")
        # provenance must be traceable from this endpoint too
        self.assertEqual(body["meta"]["snapshot_id"], SNAPSHOT)
        self.assertEqual(body["meta"]["updated_at"], UPDATED)

    def test_exclude_bj_false_keeps_them(self):
        conn = FakeConnection(dragon_rows=[
            self.row("000026.SZ", "SZ000026", "1001", 1.1e8),
            self.row("920045.BJ", None, "1002", 5.0e7, name="蘅东光"),
        ])
        body = client_for(conn).get(f"/api/dragon-tiger?date={DAY}&exclude_bj=false").json()
        self.assertEqual(body["meta"]["total"], 2)
        self.assertEqual(body["meta"]["excluded_bj"], 0)
        self.assertIsNone(body["rows"][1]["symbol"])       # convertible bond / BJ: secucode instead

    def test_collected_but_no_rows_is_empty(self):
        """fetch_log says we looked and the source had nothing: that is 'empty', not 'missing'."""
        conn = FakeConnection(dragon_rows=[], fetch_log_rows=[("ok", 0, None)])
        body = client_for(conn).get(f"/api/dragon-tiger?date={DAY}").json()
        self.assertEqual(body["meta"]["status"], "empty")
        self.assertEqual(body["rows"], [])

    def test_never_collected_is_not_collected(self):
        """No fetch_log row means the absence is ours, not the market's."""
        conn = FakeConnection(dragon_rows=[], fetch_log_rows=[])
        body = client_for(conn).get(f"/api/dragon-tiger?date={DAY}").json()
        self.assertEqual(body["meta"]["status"], "not_collected")
        self.assertEqual(body["rows"], [])

    def test_failed_collection_is_failed(self):
        conn = FakeConnection(dragon_rows=[], fetch_log_rows=[("failed", 0, "source returned 502")])
        body = client_for(conn).get(f"/api/dragon-tiger?date={DAY}").json()
        self.assertEqual(body["meta"]["status"], "failed")
        self.assertEqual(body["meta"]["error"], "source returned 502")

    def test_not_wired_without_a_log_row_is_not_collected(self):
        conn = FakeConnection(missing={"dragon_tiger", "fetch_log"})
        response = client_for(conn).get(f"/api/dragon-tiger?date={DAY}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["meta"]["status"], "not_collected")


class StockBoardsTests(unittest.TestCase):
    def test_boards_are_returned_for_a_member_symbol(self):
        conn = FakeConnection(stock_board_rows=[
            ("1205", "机械设备", "industry"), ("683", "央国企改革", "concept")])
        body = client_for(conn).get(f"/api/stocks/SH600000?date={DAY}").json()
        self.assertEqual([b["name"] for b in body["boards"]], ["机械设备", "央国企改革"])
        self.assertEqual(body["boards"][0]["type"], "industry")

    def test_no_membership_row_is_null_not_empty_list(self):
        conn = FakeConnection(stock_board_rows=[])
        body = client_for(conn).get(f"/api/stocks/SH600000?date={DAY}").json()
        self.assertIsNone(body["boards"])

    def test_not_wired_is_null(self):
        conn = FakeConnection(missing={"instruments_board"})
        body = client_for(conn).get(f"/api/stocks/SH600000?date={DAY}").json()
        self.assertIsNone(body["boards"])


if __name__ == "__main__":
    unittest.main()


class PayloadShapeTests(unittest.TestCase):
    def test_board_percentages_are_rounded_to_four_decimals(self):
        conn = FakeConnection(boards=[
            ("683", "央国企改革", "concept", 5.6377801581718385, 721, 606, 92, "SZ300620", "光库科技", 1451, 1419)])
        body = client_for(conn).get(f"/api/boards?date={DAY}").json()
        self.assertAlmostEqual(body["rows"][0]["pct_chg_ew"], 5.6378, places=4)

    def test_large_payload_is_gzipped(self):
        rows = [("683", f"板块{i}", "concept", 1.0 + i / 1000, 10, 5, 0, "SH600000", "浦发银行", 100, 90)
                for i in range(60)]
        client = client_for(FakeConnection(boards=rows))
        response = client.get(f"/api/boards?date={DAY}", headers={"accept-encoding": "gzip"})
        self.assertEqual(response.headers.get("content-encoding"), "gzip")
        # httpx decompresses transparently, so assert the content survived the round trip
        self.assertEqual(len(response.json()["rows"]), 60)
