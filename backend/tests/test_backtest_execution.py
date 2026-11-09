import unittest
from datetime import date
from decimal import Decimal

from fixtures import bar, suspended
from quant_workbench.backtest import (
    BUY,
    LIMIT_DOWN_OPEN,
    LIMIT_UP_OPEN,
    NO_TRADE,
    SELL,
    FeeSchedule,
    Fill,
    Rejection,
    fill_at_open,
)

DAY = date(2026, 11, 6)
FEES = FeeSchedule(
    commission_rate=Decimal("0.0003"),
    min_commission=Decimal("5"),
    stamp_duty_rate=Decimal("0.0005"),
    slippage_rate=Decimal("0"),
)


class BuyFillTests(unittest.TestCase):
    def test_fills_at_open_and_applies_minimum_commission(self) -> None:
        result = fill_at_open(
            bar("600000", DAY, preclose="10.00", open="10.00", high="10.50", low="9.90", close="10.20"),
            BUY,
            Decimal("100"),
            FEES,
        )
        self.assertIsInstance(result, Fill)
        self.assertEqual(result.price, Decimal("10.00"))
        self.assertEqual(result.notional, Decimal("1000.00"))
        self.assertEqual(result.fee, Decimal("5.00"))

    def test_limit_up_open_cannot_be_bought(self) -> None:
        result = fill_at_open(
            bar("600000", DAY, preclose="10.00", open="11.00", high="11.00", low="11.00", close="11.00"),
            BUY,
            Decimal("100"),
            FEES,
        )
        self.assertIsInstance(result, Rejection)
        self.assertEqual(result.reason, LIMIT_UP_OPEN)

    def test_suspended_day_cannot_buy(self) -> None:
        result = fill_at_open(suspended("600000", DAY, "10.00"), BUY, Decimal("100"), FEES)
        self.assertIsInstance(result, Rejection)
        self.assertEqual(result.reason, NO_TRADE)

    def test_new_listing_window_ignores_the_limit(self) -> None:
        result = fill_at_open(
            bar("688981", DAY, preclose="10.00", open="18.00", high="18.00", low="17.00", close="17.90"),
            BUY,
            Decimal("100"),
            FEES,
            new_listing_window=True,
        )
        self.assertIsInstance(result, Fill)

    def test_slippage_moves_the_buy_price_up(self) -> None:
        fees = FeeSchedule(
            commission_rate=Decimal("0.0003"),
            min_commission=Decimal("5"),
            stamp_duty_rate=Decimal("0.0005"),
            slippage_rate=Decimal("0.002"),
        )
        result = fill_at_open(
            bar("600000", DAY, preclose="10.00", open="10.00", high="10.50", low="9.90", close="10.20"),
            BUY,
            Decimal("100"),
            fees,
        )
        self.assertIsInstance(result, Fill)
        self.assertEqual(result.price, Decimal("10.02"))


class SellFillTests(unittest.TestCase):
    def test_sell_pays_stamp_duty_and_slippage_down(self) -> None:
        fees = FeeSchedule(
            commission_rate=Decimal("0.0003"),
            min_commission=Decimal("5"),
            stamp_duty_rate=Decimal("0.0005"),
            slippage_rate=Decimal("0.001"),
        )
        result = fill_at_open(
            bar("600000", DAY, preclose="10.00", open="10.00", high="10.50", low="9.90", close="10.20"),
            SELL,
            Decimal("1000"),
            fees,
        )
        self.assertIsInstance(result, Fill)
        self.assertEqual(result.price, Decimal("9.99"))
        notional = Decimal("9.99") * 1000
        commission = max(notional * Decimal("0.0003"), Decimal("5"))
        stamp = notional * Decimal("0.0005")
        self.assertEqual(result.fee, (commission + stamp).quantize(Decimal("0.01")))

    def test_limit_down_open_cannot_be_sold(self) -> None:
        result = fill_at_open(
            bar("600000", DAY, preclose="10.00", open="9.00", high="9.00", low="9.00", close="9.00"),
            SELL,
            Decimal("100"),
            FEES,
        )
        self.assertIsInstance(result, Rejection)
        self.assertEqual(result.reason, LIMIT_DOWN_OPEN)

    def test_stock_limit_applies_five_percent(self) -> None:
        result = fill_at_open(
            bar("600000", DAY, preclose="10.00", open="10.50", high="10.50", low="10.50", close="10.50", is_st=True),
            BUY,
            Decimal("100"),
            FEES,
        )
        self.assertIsInstance(result, Rejection)
        self.assertEqual(result.reason, LIMIT_UP_OPEN)


class GuardTests(unittest.TestCase):
    def test_unknown_side_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            fill_at_open(
                bar("600000", DAY, preclose="10.00", open="10.00", high="10.00", low="10.00", close="10.00"),
                "hold",
                Decimal("100"),
                FEES,
            )

    def test_non_positive_quantity_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            fill_at_open(
                bar("600000", DAY, preclose="10.00", open="10.00", high="10.00", low="10.00", close="10.00"),
                BUY,
                Decimal("0"),
                FEES,
            )

    def test_negative_fee_rate_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            FeeSchedule(
                commission_rate=Decimal("-0.0003"),
                min_commission=Decimal("5"),
                stamp_duty_rate=Decimal("0.0005"),
                slippage_rate=Decimal("0"),
            )


if __name__ == "__main__":
    unittest.main()
