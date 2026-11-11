import unittest
from datetime import date
from decimal import Decimal

from quant_workbench.backtest import Trade
from quant_workbench.backtest.metrics import (
    SESSIONS_PER_YEAR,
    compute_metrics,
    max_drawdown,
)


def series(values: list[str]) -> list[tuple[date, Decimal]]:
    start = date(2026, 1, 1)
    return [
        (date.fromordinal(start.toordinal() + index), Decimal(value))
        for index, value in enumerate(values)
    ]


def trade(pnl_hint: str) -> Trade:
    """Build a trade whose pnl equals `pnl_hint` with no fees."""
    entry = Decimal("10.00")
    price = entry + Decimal(pnl_hint) / Decimal("100")
    return Trade(
        symbol="600000",
        entry_date=date(2026, 1, 2),
        exit_date=date(2026, 1, 5),
        quantity=Decimal("100"),
        entry_price=entry,
        exit_price=price,
        fees=Decimal("0"),
    )


class TotalReturnTests(unittest.TestCase):
    def test_computes_simple_return(self) -> None:
        metrics = compute_metrics(series(["100", "110"]), [])
        self.assertEqual(metrics.total_return, Decimal("0.1"))

    def test_single_point_has_no_return(self) -> None:
        metrics = compute_metrics(series(["100"]), [])
        self.assertIsNone(metrics.total_return)

    def test_annualization_needs_enough_sessions(self) -> None:
        short = compute_metrics(series(["100", "110"]), [])
        self.assertIsNone(short.annual_return)
        long_equity = series(["100"] + ["105"] * (SESSIONS_PER_YEAR - 1))
        self.assertIsNotNone(compute_metrics(long_equity, []).annual_return)


class DrawdownTests(unittest.TestCase):
    def test_measures_peak_to_trough(self) -> None:
        values = [Decimal(v) for v in ("100", "120", "90", "110")]
        self.assertEqual(max_drawdown(values), Decimal("-0.25"))

    def test_monotonic_rise_has_no_drawdown(self) -> None:
        self.assertEqual(max_drawdown([Decimal("100"), Decimal("110")]), Decimal("0"))

    def test_needs_two_points(self) -> None:
        self.assertIsNone(max_drawdown([Decimal("100")]))


class TradeStatsTests(unittest.TestCase):
    def test_win_rate_and_fees(self) -> None:
        trades = [trade("100"), trade("-50"), trade("20")]
        metrics = compute_metrics(series(["100", "101"]), trades)
        self.assertEqual(metrics.trades, 3)
        self.assertEqual(metrics.win_rate, Decimal(2) / Decimal(3))

    def test_no_trades_reports_none_not_zero(self) -> None:
        metrics = compute_metrics(series(["100", "101"]), [])
        self.assertIsNone(metrics.win_rate)
        self.assertEqual(metrics.fees, Decimal("0"))


class BenchmarkTests(unittest.TestCase):
    def test_excess_return_subtracts_benchmark(self) -> None:
        metrics = compute_metrics(
            series(["100", "120"]), [], benchmark=[Decimal("100"), Decimal("110")]
        )
        self.assertEqual(metrics.benchmark_return, Decimal("0.1"))
        self.assertEqual(metrics.excess_return, Decimal("0.1"))

    def test_missing_benchmark_leaves_excess_none(self) -> None:
        metrics = compute_metrics(series(["100", "120"]), [])
        self.assertIsNone(metrics.benchmark_return)
        self.assertIsNone(metrics.excess_return)


if __name__ == "__main__":
    unittest.main()
