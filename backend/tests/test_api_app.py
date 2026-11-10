import unittest
from datetime import date
from unittest import mock

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
        if "IS NULL" in query:
            rows = [(0,)]
        elif "FROM index_bars" in query:
            rows = [("sh.000300", "沪深300", 4012.5, 0.82, 3.1e11)]
        elif "FROM limit_streaks" in query:
            rows = [("SZ300446", 25, True)]
        elif "FROM data_quality" in query:
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
    return TestClient(create_app(connect=lambda: conn, allow_anonymous=True))


class HealthTests(unittest.TestCase):
    def test_health_is_ok(self) -> None:
        response = client_for(FakeConnection([])).get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})


class ReviewEndpointTests(unittest.TestCase):
    def test_unknown_symbol_returns_404_not_500(self) -> None:
        # No stored bars for the symbol: the service raises KeyError, which must surface as 404.
        client = TestClient(create_app(lambda: FakeConnection([]), api_token="t"))
        response = client.get("/api/stocks/SH999999?date=2026-11-06", headers={"authorization": "Bearer t"})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"]["code"], "UNKNOWN_SYMBOL")

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
        response = TestClient(create_app(connect=lambda: conn, allow_anonymous=True)).get("/api/data-status")
        self.assertEqual(response.status_code, 503)


if __name__ == "__main__":
    unittest.main()


class AuthTests(unittest.TestCase):
    def _client(self, **kwargs) -> TestClient:
        return TestClient(create_app(connect=lambda: FakeConnection([bar_row()]), **kwargs))

    def test_health_is_always_open(self) -> None:
        self.assertEqual(self._client(api_token="secret").get("/health").status_code, 200)

    def test_review_requires_the_token(self) -> None:
        client = self._client(api_token="secret")
        self.assertEqual(client.get(f"/api/review?date={DAY}").status_code, 401)
        self.assertEqual(
            client.get(f"/api/review?date={DAY}", headers={"authorization": "Bearer wrong"}).status_code,
            401,
        )
        self.assertEqual(
            client.get(f"/api/review?date={DAY}", headers={"authorization": "Bearer secret"}).status_code,
            200,
        )

    def test_no_token_configuration_refuses_traffic(self) -> None:
        response = self._client().get(f"/api/review?date={DAY}")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "NO_TOKEN_CONFIGURED")

    def test_anonymous_mode_must_be_explicit(self) -> None:
        response = self._client(allow_anonymous=True).get(f"/api/review?date={DAY}")
        self.assertEqual(response.status_code, 200)


class EnvironmentConfigTests(unittest.TestCase):
    def test_factory_reads_the_token_from_the_environment(self) -> None:
        with mock.patch.dict("os.environ", {"QW_API_TOKEN": "env-secret"}, clear=False):
            client = TestClient(create_app(connect=lambda: FakeConnection([bar_row()])))
            self.assertEqual(client.get(f"/api/review?date={DAY}").status_code, 401)
            self.assertEqual(
                client.get(
                    f"/api/review?date={DAY}", headers={"authorization": "Bearer env-secret"}
                ).status_code,
                200,
            )

    def test_explicit_argument_beats_the_environment(self) -> None:
        with mock.patch.dict("os.environ", {"QW_API_TOKEN": "env-secret"}, clear=False):
            client = TestClient(
                create_app(connect=lambda: FakeConnection([bar_row()]), api_token="explicit")
            )
            self.assertEqual(
                client.get(
                    f"/api/review?date={DAY}", headers={"authorization": "Bearer explicit"}
                ).status_code,
                200,
            )

    def test_anonymous_flag_is_read_from_the_environment(self) -> None:
        with mock.patch.dict("os.environ", {"QW_ALLOW_ANONYMOUS": "1"}, clear=False):
            with mock.patch.dict("os.environ", {"QW_API_TOKEN": ""}, clear=False):
                client = TestClient(create_app(connect=lambda: FakeConnection([bar_row()])))
                self.assertEqual(client.get(f"/api/review?date={DAY}").status_code, 200)
