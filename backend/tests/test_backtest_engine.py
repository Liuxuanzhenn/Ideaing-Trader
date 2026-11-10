import unittest
from datetime import date
from decimal import Decimal

from fixtures import bar, suspended
from quant_workbench.backtest import FeeSchedule, Trade, run_backtest
from quant_workbench.market.calendar import TradingCalendar

D = [date(2026, 11, day) for day in (2, 3, 4, 5, 6)]
CAL = TradingCalendar.from_open_days(D)
FREE = FeeSchedule(
    commission_rate=Decimal("0"),
    min_commission=Decimal("0"),
    stamp_duty_rate=Decimal("0"),
    slippage_rate=Decimal("0"),
)


def flat(symbol: str, prices: dict[date, str]) -> list:
    return [
        bar(symbol, day, preclose=price, open=price, high=price, low=price, close=price)
        for day, price in prices.items()
    ]


class EntryAndExitTests(unittest.TestCase):
    def test_buys_next_session_and_exits_after_holding_days(self) -> None:
        bars = {"600000": flat("600000", {D[0]: "10.00", D[1]: "10.00", D[2]: "11.00", D[3]: "12.00"})}
        result = run_backtest(
            bars=bars,
            entries={D[0]: ["600000"]},
            calendar=CAL,
            fees=FREE,
            start=D[0],
            end=D[3],
            capital=Decimal("10000"),
            max_positions=1,
            holding_days=2,
        )
        self.assertEqual(len(result.trades), 1)
        trade = result.trades[0]
        self.assertIsInstance(trade, Trade)
        self.assertEqual(trade.entry_date, D[1])
        self.assertEqual(trade.quantity, Decimal("1000"))
        self.assertEqual(trade.exit_date, D[3])
        self.assertEqual(trade.pnl, Decimal("2000.00"))

    def test_equity_series_covers_every_session(self) -> None:
        bars = {"600000": flat("600000", {day: "10.00" for day in D})}
        result = run_backtest(
            bars=bars,
            entries={D[0]: ["600000"]},
            calendar=CAL,
            fees=FREE,
            start=D[0],
            end=D[3],
            capital=Decimal("10000"),
            max_positions=1,
            holding_days=1,
        )
        self.assertEqual([day for day, _ in result.equity], D[:4])
        self.assertEqual(result.equity[0][1], Decimal("10000"))


class RejectionTests(unittest.TestCase):
    def test_suspended_entry_is_skipped(self) -> None:
        bars = {"600000": [suspended("600000", D[1], "10.00")]}
        result = run_backtest(
            bars=bars,
            entries={D[0]: ["600000"]},
            calendar=CAL,
            fees=FREE,
            start=D[0],
            end=D[1],
            capital=Decimal("10000"),
            max_positions=1,
            holding_days=1,
        )
        self.assertEqual(result.trades, ())
        reasons = {(skip.symbol, skip.reason) for skip in result.skips}
        self.assertIn(("600000", "no_trade"), reasons)

    def test_limit_locked_exit_waits_for_the_next_session(self) -> None:
        bars = {
            "600000": [
                bar("600000", D[1], preclose="10.00", open="10.00", high="10.00", low="10.00", close="10.00"),
                bar("600000", D[2], preclose="10.00", open="9.00", high="9.00", low="9.00", close="9.00"),
                bar("600000", D[3], preclose="9.00", open="9.20", high="9.20", low="9.20", close="9.20"),
            ]
        }
        result = run_backtest(
            bars=bars,
            entries={D[0]: ["600000"]},
            calendar=CAL,
            fees=FREE,
            start=D[0],
            end=D[3],
            capital=Decimal("10000"),
            max_positions=1,
            holding_days=1,
        )
        self.assertEqual(len(result.trades), 1)
        self.assertEqual(result.trades[0].exit_date, D[3])
        self.assertIn("limit_down_open", {skip.reason for skip in result.skips})

    def test_entry_beyond_max_positions_is_skipped(self) -> None:
        bars = {
            "600000": flat("600000", {D[1]: "10.00"}),
            "600001": flat("600001", {D[1]: "10.00"}),
        }
        result = run_backtest(
            bars=bars,
            entries={D[0]: ["600000", "600001"]},
            calendar=CAL,
            fees=FREE,
            start=D[0],
            end=D[1],
            capital=Decimal("10000"),
            max_positions=1,
            holding_days=5,
        )
        self.assertIn("no_free_slot", {skip.reason for skip in result.skips})


class GuardTests(unittest.TestCase):
    def test_rejects_invalid_parameters(self) -> None:
        for kwargs in (
            {"capital": Decimal("0"), "max_positions": 1, "holding_days": 1},
            {"capital": Decimal("100"), "max_positions": 0, "holding_days": 1},
            {"capital": Decimal("100"), "max_positions": 1, "holding_days": 0},
        ):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                run_backtest(
                    bars={}, entries={}, calendar=CAL, fees=FREE, start=D[0], end=D[1], **kwargs
                )


if __name__ == "__main__":
    unittest.main()


class ValuationTests(unittest.TestCase):
    def test_suspended_holding_keeps_its_last_close(self) -> None:
        bars = {
            "600000": [
                bar("600000", D[1], preclose="10.00", open="10.00", high="10.00", low="10.00", close="10.00"),
                suspended("600000", D[2], "10.00"),
                suspended("600000", D[3], "10.00"),
            ]
        }
        result = run_backtest(
            bars=bars,
            entries={D[0]: ["600000"]},
            calendar=CAL,
            fees=FREE,
            start=D[0],
            end=D[3],
            capital=Decimal("10000"),
            max_positions=1,
            holding_days=9,
        )
        self.assertEqual(result.equity[-1][1], Decimal("10000"))

    def test_slippage_cannot_push_cash_negative(self) -> None:
        fees = FeeSchedule(
            commission_rate=Decimal("0.0003"),
            min_commission=Decimal("5"),
            stamp_duty_rate=Decimal("0"),
            slippage_rate=Decimal("0.01"),
        )
        bars = {"600000": flat("600000", {D[1]: "10.00", D[2]: "10.00"})}
        result = run_backtest(
            bars=bars,
            entries={D[0]: ["600000"]},
            calendar=CAL,
            fees=fees,
            start=D[0],
            end=D[2],
            capital=Decimal("5000"),
            max_positions=1,
            holding_days=5,
        )
        for _, value in result.equity:
            self.assertGreaterEqual(value, Decimal("0"))
