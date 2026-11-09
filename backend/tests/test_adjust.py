import unittest
from datetime import date
from decimal import Decimal

from quant_workbench.data.adjust import (
    FactorChange,
    apply_factors,
    collapse_to_changes,
    derive_adjustment_factors,
    factor_on,
    normalize_to_latest,
)


class DeriveFactorsTests(unittest.TestCase):
    def test_ratio_marks_the_ex_date(self) -> None:
        raw = [Decimal("10.00"), Decimal("11.00"), Decimal("5.50")]
        adjusted = [Decimal("10.00"), Decimal("11.00"), Decimal("11.00")]
        factors = derive_adjustment_factors(raw, adjusted)
        self.assertEqual(factors[0], factors[1])
        self.assertEqual(factors[2], Decimal("2.0"))

    def test_length_mismatch_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            derive_adjustment_factors([Decimal("10")], [Decimal("10"), Decimal("10")])

    def test_empty_series_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            derive_adjustment_factors([], [])

    def test_non_positive_close_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            derive_adjustment_factors([Decimal("0")], [Decimal("10")])


class NormalizeTests(unittest.TestCase):
    def test_latest_factor_becomes_one(self) -> None:
        normalized = normalize_to_latest([Decimal("2"), Decimal("4"), Decimal("8")])
        self.assertEqual(normalized, (Decimal("0.25"), Decimal("0.5"), Decimal("1")))

    def test_empty_input_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            normalize_to_latest([])


class ApplyFactorsTests(unittest.TestCase):
    def test_split_does_not_create_a_fake_loss(self) -> None:
        """A 10 -> 5 split must not show up as -50% once factors are applied."""
        raw = [Decimal("10.00"), Decimal("5.00")]
        adjusted = [Decimal("5.00"), Decimal("5.00")]
        factors = normalize_to_latest(derive_adjustment_factors(raw, adjusted))
        self.assertEqual(apply_factors(raw, factors), (Decimal("5.0000"), Decimal("5.0000")))

    def test_length_mismatch_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            apply_factors([Decimal("10")], [Decimal("1"), Decimal("1")])


if __name__ == "__main__":
    unittest.main()


class ChangePointTests(unittest.TestCase):
    def test_collapses_repeated_factors(self) -> None:
        dates = [date(2024, 1, 2), date(2024, 1, 3), date(2024, 6, 20), date(2024, 6, 21)]
        factors = [Decimal("1"), Decimal("1"), Decimal("0.5"), Decimal("0.5")]
        changes = collapse_to_changes(dates, factors)
        self.assertEqual([c.factor for c in changes], [Decimal("1"), Decimal("0.5")])
        self.assertEqual(changes[1].effect_date, date(2024, 6, 20))

    def test_unsorted_dates_are_rejected(self) -> None:
        with self.assertRaises(ValueError):
            collapse_to_changes([date(2024, 6, 20), date(2024, 1, 2)], [Decimal("1"), Decimal("1")])

    def test_factor_on_forward_fills(self) -> None:
        changes = (
            FactorChange(date(2024, 6, 20), Decimal("0.5")),
            FactorChange(date(2025, 6, 20), Decimal("0.25")),
        )
        self.assertIsNone(factor_on(changes, date(2024, 1, 2)))
        self.assertEqual(factor_on(changes, date(2024, 6, 20)), Decimal("0.5"))
        self.assertEqual(factor_on(changes, date(2025, 1, 2)), Decimal("0.5"))
        self.assertEqual(factor_on(changes, date(2026, 1, 2)), Decimal("0.25"))
