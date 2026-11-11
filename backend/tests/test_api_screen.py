import unittest
from datetime import date, datetime, timezone

from quant_workbench.api.contracts import DataMeta
from quant_workbench.api.screen_service import options, screen

SNAPSHOT = "baostock:2010-01-04..2026-11-06"
UPDATED = datetime(2026, 11, 10, 16, 40, tzinfo=timezone.utc)
DAY = date(2026, 11, 6)


class FakeConnection:
    """Returns canned screen rows and records the SQL/parameters it was given."""

    def __init__(self, rows=None, *, st_count=0, window_start="2026-10-01", latest=DAY):
        self.rows = rows if rows is not None else []
        self.st_count = st_count
        self.window_start = window_start
        self.latest = latest
        self.calls: list[tuple[str, list]] = []

    def execute(self, query, parameters=None):
        params = list(parameters or [])
        self.calls.append((query, params))
        if "is_st = 1" in query:
            rows = [(self.st_count,)]
        elif "min(trade_date)" in query:
            rows = [(self.window_start,)]
        elif "max(trade_date)" in query:
            rows = [(self.latest.isoformat() if self.latest else None,)]
        else:
            rows = self.rows

        class _Result:
            def fetchall(_inner):
                return rows

        return _Result()


class ScreenTests(unittest.TestCase):
    def test_conditions_are_translated_to_sql_in_order(self):
        conn = FakeConnection([("SH600000", 11.0, 10.0, 1.5, 1e8, 3, 5)])
        result = screen(
            conn,
            [{"field": "chg_pct", "op": "gte", "value": 9.5}, {"field": "ladder", "op": "gte", "value": 2}],
            DAY,
            snapshot_id=SNAPSHOT,
            updated_at=UPDATED,
        )
        query, params = [call for call in conn.calls if "WITH day" in call[0]][-1]
        self.assertIn("(d.close / d.preclose - 1) * 100 >= ?", query)
        self.assertIn("coalesce(s.ladder, 0) >= ?", query)
        self.assertEqual(params[-2:], [9.5, 2])
        self.assertEqual(result.rows[0].code, "SH600000")
        self.assertEqual(result.rows[0].ladder, 3)

    def test_market_cap_is_refused_with_a_reason(self):
        with self.assertRaises(ValueError) as caught:
            screen(FakeConnection(), [{"field": "mcap", "op": "gte", "value": 1e9}], DAY,
                   snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertIn("流通市值", str(caught.exception))

    def test_unknown_field_and_operator_are_rejected(self):
        for condition in (
            {"field": "pe", "op": "gte", "value": 10},
            {"field": "chg_pct", "op": "between", "value": 10},
        ):
            with self.assertRaises(ValueError):
                screen(FakeConnection(), [condition], DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)

    def test_non_numeric_value_is_rejected(self):
        with self.assertRaises(ValueError):
            screen(FakeConnection(), [{"field": "chg_pct", "op": "gte", "value": "9.5"}], DAY,
                   snapshot_id=SNAPSHOT, updated_at=UPDATED)

    def test_too_many_conditions_are_rejected(self):
        many = [{"field": "chg_pct", "op": "gte", "value": 1}] * 7
        with self.assertRaises(ValueError):
            screen(FakeConnection(), many, DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)

    def test_st_rows_are_excluded_and_counted(self):
        conn = FakeConnection([("SH600000", 11.0, 10.0, 1.5, 1e8, 0, 0)], st_count=170)
        result = screen(conn, [], DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertEqual(result.excluded, {"st": 170})
        screen_params = [call for call in conn.calls if "WITH day" in call[0]][-1][1]
        self.assertFalse(screen_params[1])

    def test_excluding_st_can_be_turned_off(self):
        conn = FakeConnection([("SH600000", 11.0, 10.0, 1.5, 1e8, 0, 0)], st_count=170)
        result = screen(conn, [], DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED, exclude_st=False)
        self.assertEqual(result.excluded, {})
        screen_params = [call for call in conn.calls if "WITH day" in call[0]][-1][1]
        self.assertTrue(screen_params[1])

    def test_limit_window_uses_trading_days_not_calendar_days(self):
        conn = FakeConnection()
        screen(conn, [{"field": "limit_20", "op": "gte", "value": 1}], DAY,
               snapshot_id=SNAPSHOT, updated_at=UPDATED)
        window_query = [call for call in conn.calls if "min(trade_date)" in call[0]][0]
        self.assertEqual(window_query[1], [DAY.isoformat(), 20])

    def test_options_advertise_unavailable_fields(self):
        payload = options(FakeConnection(), snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertTrue(payload.unavailable)
        self.assertIn("流通市值", payload.unavailable[0])

    def test_empty_database_is_an_error_not_an_empty_result(self):
        with self.assertRaises(ValueError):
            screen(FakeConnection(latest=None), [], None, snapshot_id=SNAPSHOT, updated_at=UPDATED)


if __name__ == "__main__":
    unittest.main()
