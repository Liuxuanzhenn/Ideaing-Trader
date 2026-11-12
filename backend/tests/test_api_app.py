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
        elif "sum(amount)" in query:
            rows = [(1.5e12,)]
        elif "max(trade_date) FROM bars WHERE trade_date <" in query:
            rows = [("2026-11-05",)]
        elif "WITH prev AS (SELECT symbol, streak" in query:
            rows = [(1, 18, 3)]
        elif "WITH prev AS (SELECT symbol FROM limit_streaks" in query:
            rows = [(5.2,)]
        elif "FROM session_stats" in query:
            rows = [("2026-11-06", 500, 400, 60, 33, 16, 15, 49, 0.6734, 5, 12, 1.5e12)]
        elif "FROM index_bars" in query:
            if "b.trade_date <=" in query:
                rows = [("sh.000300", "沪深300", "2026-11-06", 4012.5)]
            else:
                rows = [("sh.000300", "沪深300", 4012.5, 0.82, 3.1e11)]
        elif "FROM limit_streaks" in query:
            rows = [("SZ300446", 25, True)]
        elif "FROM data_quality" in query:
            if "GROUP BY" in query:
                rows = [("snapshot-abc", "2026-11-10T15:54:17+00:00")]
            else:
                rows = self.quality
        elif "FROM instruments WHERE symbol = ?" in query:
            rows = [row for row in self.instruments if row[0] == parameters[0]]
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


class PortfolioEndpointTests(unittest.TestCase):
    def test_unknown_symbol_is_rejected_without_persisting(self) -> None:
        import tempfile
        from pathlib import Path

        from quant_workbench.api.portfolio_store import PortfolioStore

        with tempfile.TemporaryDirectory() as temp:
            store = PortfolioStore(Path(temp) / "portfolio.json")
            client = TestClient(
                create_app(connect=lambda: FakeConnection([]), allow_anonymous=True, portfolio=store)
            )
            response = client.post("/api/portfolio/watchlist", json={"code": "SH999999"})
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.json()["detail"]["code"], "UNKNOWN_SYMBOL")
            self.assertEqual(store.list(), {"watchlist": [], "basket": []})
            self.assertFalse(store.path.exists())

    def test_existing_symbol_add_is_idempotent_and_remove_persists(self) -> None:
        import tempfile
        from pathlib import Path

        from quant_workbench.api.portfolio_store import PortfolioStore

        with tempfile.TemporaryDirectory() as temp:
            store = PortfolioStore(Path(temp) / "portfolio.json")
            client = TestClient(
                create_app(connect=lambda: FakeConnection([]), allow_anonymous=True, portfolio=store)
            )
            first = client.post("/api/portfolio/watchlist", json={"code": "SH600000"})
            duplicate = client.post("/api/portfolio/watchlist", json={"code": "600000"})
            self.assertEqual(first.status_code, 200)
            self.assertEqual(duplicate.status_code, 200)
            self.assertEqual(duplicate.json()["watchlist"], ["SH600000"])
            reopened = PortfolioStore(store.path)
            self.assertEqual(reopened.list()["watchlist"], ["SH600000"])
            removed = client.delete("/api/portfolio/watchlist/SH600000")
            self.assertEqual(removed.status_code, 200)
            self.assertEqual(PortfolioStore(store.path).list()["watchlist"], [])


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


class _StockConnection:
    """Just enough rows for one stock detail call, shaped like the real queries."""

    def __init__(self, symbol: str = "SH600000", day: str = "2026-11-06") -> None:
        self.symbol = symbol
        self.day = day
        self.closed = False

    def execute(self, query, parameters=None):
        params = list(parameters or [])
        if "FROM limit_streaks" in query:
            rows = [(0, 0)]
        elif "SELECT board FROM instruments" in query:
            rows = [("Main",)]
        elif "SELECT symbol FROM instruments WHERE symbol = ?" in query:
            rows = [(self.symbol,)]
        elif "max(trade_date)" in query:
            rows = [(self.day,)]
        elif "FROM data_quality" in query:
            rows = [("snapshot-abc", "2026-11-10T15:54:17+00:00")]
        elif "FROM bars" in query:
            rows = [(self.symbol, self.day, 10.0, 11.0, 9.9, 11.0, 10.0, 1000.0, 1.0e7, 1.5, 0, True)]
        else:
            rows = []

        class _Result:
            def fetchall(_inner):
                return rows

        return _Result()

    def close(self) -> None:
        self.closed = True


class StockEndpointMissingSourceTests(unittest.TestCase):
    """Fields with no data source behind them must be null, never an empty list."""

    def test_concepts_is_null_in_the_response(self) -> None:
        client = TestClient(create_app(connect=lambda: _StockConnection(), allow_anonymous=True))
        response = client.get(f"/api/stocks/SH600000?date={DAY}")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("concepts", body)
        self.assertIsNone(body["concepts"])
