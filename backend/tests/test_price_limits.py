import unittest
from datetime import date
from decimal import Decimal

from quant_workbench.market import (
    GROWTH,
    MAIN,
    STAR,
    board_from_symbol,
    limit_prices,
    limit_ratio,
)


class BoardFromSymbolTests(unittest.TestCase):
    def test_maps_bare_and_prefixed_codes(self) -> None:
        cases = {
            "600000": MAIN,
            "SH600000": MAIN,
            "000001": MAIN,
            "300750": GROWTH,
            "sz.300750": GROWTH,
            "688981": STAR,
            "sh.688981": STAR,
        }
        for symbol, expected in cases.items():
            with self.subTest(symbol=symbol):
                self.assertEqual(board_from_symbol(symbol), expected)

    def test_rejects_out_of_scope_codes(self) -> None:
        for symbol in ("830799", "BJ830799", "900901", "200011"):
            with self.subTest(symbol=symbol), self.assertRaises(ValueError):
                board_from_symbol(symbol)


class LimitRatioTests(unittest.TestCase):
    def test_main_board_and_st(self) -> None:
        day = date(2026, 11, 6)
        self.assertEqual(limit_ratio(MAIN, False, day), Decimal("0.10"))
        self.assertEqual(limit_ratio(MAIN, True, day), Decimal("0.05"))

    def test_growth_board_switches_on_reform_date(self) -> None:
        self.assertEqual(limit_ratio(GROWTH, False, date(2020, 8, 21)), Decimal("0.10"))
        self.assertEqual(limit_ratio(GROWTH, False, date(2020, 8, 24)), Decimal("0.20"))

    def test_st_stays_twenty_percent_on_both_new_boards(self) -> None:
        day = date(2026, 11, 6)
        self.assertEqual(limit_ratio(GROWTH, True, day), Decimal("0.20"))
        self.assertEqual(limit_ratio(STAR, True, day), Decimal("0.20"))

    def test_new_listing_window_has_no_limit(self) -> None:
        self.assertIsNone(limit_ratio(STAR, False, date(2020, 7, 16), new_listing_window=True))
        self.assertIsNone(limit_ratio(MAIN, False, date(2026, 11, 6), new_listing_window=True))

    def test_unknown_board_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            limit_ratio("bse", False, date(2026, 11, 6))


class LimitPriceTests(unittest.TestCase):
    def test_rounds_to_one_cent(self) -> None:
        self.assertEqual(
            limit_prices(Decimal("3.33"), Decimal("0.05")),
            (Decimal("3.50"), Decimal("3.16")),
        )

    def test_ten_percent_round_numbers(self) -> None:
        self.assertEqual(
            limit_prices(Decimal("10.00"), Decimal("0.10")),
            (Decimal("11.00"), Decimal("9.00")),
        )

    def test_no_limit_returns_none(self) -> None:
        self.assertIsNone(limit_prices(Decimal("10.00"), None))

    def test_non_positive_preclose_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            limit_prices(Decimal("0"), Decimal("0.10"))


if __name__ == "__main__":
    unittest.main()


class EffectiveStTests(unittest.TestCase):
    def _bar(self, **kwargs):
        from fixtures import bar

        return bar(
            kwargs.pop("symbol", "600000"),
            date(2026, 11, 6),
            preclose="10.00",
            open="10.00",
            high=kwargs.pop("high", "10.20"),
            low=kwargs.pop("low", "9.90"),
            close=kwargs.pop("close", "10.10"),
            **kwargs,
        )

    def test_non_st_bar_is_false(self) -> None:
        from quant_workbench.market import is_st_effective

        self.assertFalse(is_st_effective(self._bar()))

    def test_st_bar_within_five_percent_stays_st(self) -> None:
        from quant_workbench.market import is_st_effective

        self.assertTrue(is_st_effective(self._bar(is_st=True, high="10.50", close="10.50")))

    def test_st_bar_beyond_five_percent_is_contradicted(self) -> None:
        from quant_workbench.market import is_st_effective

        self.assertFalse(is_st_effective(self._bar(is_st=True, high="10.90", close="10.80")))

    def test_growth_board_st_keeps_twenty_percent(self) -> None:
        from quant_workbench.market import is_st_effective

        self.assertTrue(is_st_effective(self._bar(symbol="300750", is_st=True, high="11.50", close="11.40")))
