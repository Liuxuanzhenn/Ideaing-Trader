import unittest
from decimal import Decimal

from quant_workbench.data.adjust import (
    apply_factors,
    derive_adjustment_factors,
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
