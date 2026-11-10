import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from quant_workbench.api.backtest_service import MAX_SESSIONS, run

SNAPSHOT = "baostock:2010-01-04..2026-11-06"
UPDATED = datetime(2026, 11, 10, 16, 40, tzinfo=timezone.utc)
START = date(2026, 10, 1)
END = date(2026, 10, 31)


def bar_row(symbol, day, price):
    return (symbol, day, price, price + 0.1, price - 0.1, price, price, 1000.0, 1e7, 1.0, 0, True)


class FakeConnection:
    def __init__(self, *, sessions, signals, bars):
        self.sessions = sessions
        self.signals = signals
        self.bars = bars
        self.calls = []

    def execute(self, query, parameters=None):
        params = list(parameters or [])
        self.calls.append((query, params))
        if "FROM limit_streaks" in query and "streak = ?" in query:
            rows = [(day, symbol) for day, symbols in self.signals.items() for symbol in symbols]
        elif "DISTINCT trade_date" in query:
            rows = [(day,) for day in self.sessions]
        elif "max(trade_date) FROM bars" in query:
            rows = [(self.sessions[-1],)]
        elif "FROM bars" in query:
            wanted = set(params[:-2])
            rows = [row for row in self.bars if row[0] in wanted and params[-2] <= row[1] <= params[-1]]
        else:
            rows = []

        class _Result:
            def fetchall(_inner):
                return rows

        return _Result()


def sessions(count=30):
    day = START
    out = []
    for _ in range(count):
        out.append(day.isoformat())
        day += timedelta(days=1)
    return out


class BacktestServiceTests(unittest.TestCase):
    def _run(self, conn, **kwargs):
        params = dict(
            strategy="first_board",
            start=date(2026, 10, 5),
            end=date(2026, 10, 20),
            capital=Decimal("100000"),
            max_positions=2,
            holding_days=2,
            snapshot_id=SNAPSHOT,
            updated_at=UPDATED,
        )
        params.update(kwargs)
        return run(conn, **params)

    def _conn(self, signals=None, bars=None):
        days = sessions(30)
        signals = signals if signals is not None else {"2026-10-06": ["SH600000"]}
        bars = bars if bars is not None else [
            bar_row("SH600000", day, 10.0 + index * 0.1) for index, day in enumerate(days)
        ]
        return FakeConnection(sessions=days, signals=signals, bars=bars)

    def test_report_carries_parameters_and_equity(self):
        report = self._run(self._conn())
        self.assertEqual(report.params.strategy, "first_board")
        self.assertEqual(report.params.holding_days, 2)
        self.assertGreater(len(report.equity), 0)
        self.assertAlmostEqual(report.starting_capital, 100000.0)

    def test_no_signals_returns_an_explanation_not_an_empty_success(self):
        report = self._run(self._conn(signals={}))
        self.assertEqual(report.trades, ())
        self.assertIn("没有任何首板信号", report.note)
        self.assertIsNone(report.total_return)

    def test_range_wider_than_the_limit_is_rejected(self):
        many = [
            f"{year}-{month:02d}-{day:02d}"
            for year in (2024, 2025, 2026)
            for month in range(1, 13)
            for day in range(1, 29)
        ]
        conn = FakeConnection(sessions=many, signals={}, bars=[])
        with self.assertRaises(ValueError) as caught:
            self._run(conn, start=date(2024, 1, 1), end=date(2026, 12, 28))
        self.assertIn(str(MAX_SESSIONS), str(caught.exception))

    def test_start_after_end_is_rejected(self):
        with self.assertRaises(ValueError):
            self._run(self._conn(), start=date(2026, 10, 20), end=date(2026, 10, 5))

    def test_unknown_strategy_is_rejected(self):
        with self.assertRaises(ValueError):
            self._run(self._conn(), strategy="magic")

    def test_invalid_parameters_are_rejected(self):
        for kwargs in ({"capital": Decimal("0")}, {"max_positions": 0}, {"holding_days": 0}):
            with self.assertRaises(ValueError):
                self._run(self._conn(), **kwargs)

    def test_only_signal_symbols_are_loaded(self):
        conn = self._conn()
        self._run(conn)
        bar_calls = [call for call in conn.calls if "FROM bars" in call[0] and "IN (" in call[0]]
        self.assertTrue(bar_calls)
        self.assertEqual(bar_calls[0][1][:-2], ["SH600000"])

    def test_skips_are_counted_by_reason(self):
        report = self._run(self._conn())
        for reason, count in report.skips.items():
            self.assertIsInstance(reason, str)
            self.assertGreater(count, 0)


if __name__ == "__main__":
    unittest.main()
