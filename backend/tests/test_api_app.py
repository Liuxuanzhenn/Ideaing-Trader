import unittest
from datetime import date

from fastapi.testclient import TestClient

from quant_workbench.api.app import create_app

DAY = "2026-11-06"


class FakeConnection:
    """Routes the three query shapes the endpoints use to canned rows."""

    def __init__(self, bars, *, instruments=None, sessions=None, quality=None) -> None:
        self.bars = bars
        self.instruments = instruments if instruments is not None else [("SH600000", "2026-11-01")]
        self.sessions = sessions if sessions is not None else [
            (f"2026-11-{day:02d}",) for day in range(1, 7)
        ]
        self.quality = quality if quality is not None else [
            ("cost_basis", "review", "14615505 rows", ">0", "pass", "full history loaded"),
            ("is_st_contradicted_by_band", "market", "2540 rows", "0", "warn", "snapshot lag"),
        ]
        self.closed = False

    def execute(self, query, parameters=None):
        if "FROM data_quality" in query:
            if "GROUP BY" in query:
                rows = [("snapshot-abc", "2026-11-10T15:54:17+00:00")]
            else:
                rows = self.quality
        elif "FROM instruments" in query:
            rows = self.instruments
        elif "DISTINCT trade_date" in query:
            rows = self.sessions
        else:
            rows = self.bars

        class _Result:
            def fetchall(_inner):
                return rows

        return _Result()

    def close(self) -> None:
        self.closed = True


def bar_row(symbol="SH600000", *, close=11.0, preclose=10.0, high=11.0, is_st=0):
    return (symbol, DAY, 10.0, high, 9.9, close, preclose, 1000.0, 1000.0, 1.5, is_st, True)


def client_for(conn) -> TestClient:
    return TestClient(create_app(connect=lambda: conn))


class HealthTests(unittest.TestCase):
    def test_health_is_ok(self) -> None:
        response = client_for(FakeConnection([])).get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})


class ReviewEndpointTests(unittest.TestCase):
    def test_returns_contract_shape(self) -> None:
        response = client_for(FakeConnection([bar_row()])).get(f"/api/review?date={DAY}")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["meta"]["as_of"], DAY)
        self.assertEqual(body["meta"]["snapshot_id"], "snapshot-abc")
        self.assertIn("touched_up", body["limits"])
        self.assertIn("out_of_band", body["limits"])

    def test_updated_at_comes_from_the_snapshot_not_the_clock(self) -> None:
        body = client_for(FakeConnection([bar_row()])).get(f"/api/review?date={DAY}").json()
        self.assertEqual(body["meta"]["updated_at"], "2026-11-10T15:54:17+00:00")

    def test_empty_session_returns_empty_level(self) -> None:
        body = client_for(FakeConnection([])).get(f"/api/review?date={DAY}").json()
        self.assertEqual(body["meta"]["level"], "empty")
        self.assertFalse(body["is_trading_day"])

    def test_bad_date_is_a_400(self) -> None:
        response = client_for(FakeConnection([])).get("/api/review?date=2026-13-40")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"]["code"], "INVALID_DATE")

    def test_connection_is_closed_after_the_request(self) -> None:
        conn = FakeConnection([bar_row()])
        client_for(conn).get(f"/api/review?date={DAY}")
        self.assertTrue(conn.closed)

    def test_data_fault_is_surfaced_as_422(self) -> None:
        broken = list(bar_row())
        broken[7] = None  # volume NULL on a traded row
        response = client_for(FakeConnection([tuple(broken)])).get(f"/api/review?date={DAY}")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"]["code"], "DATA_ERROR")


class DataStatusTests(unittest.TestCase):
    def test_lists_checks_and_counts_warnings(self) -> None:
        body = client_for(FakeConnection([])).get("/api/data-status").json()
        self.assertEqual(body["snapshot_id"], "snapshot-abc")
        self.assertEqual(len(body["checks"]), 2)
        self.assertEqual(body["warning_count"], 1)

    def test_no_snapshot_is_a_503(self) -> None:
        conn = FakeConnection([], quality=[])
        conn.execute = lambda query, parameters=None: type(
            "R", (), {"fetchall": lambda _s: []}
        )()
        response = TestClient(create_app(connect=lambda: conn)).get("/api/data-status")
        self.assertEqual(response.status_code, 503)


if __name__ == "__main__":
    unittest.main()
