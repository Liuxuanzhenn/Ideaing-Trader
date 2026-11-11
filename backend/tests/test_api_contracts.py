import unittest
from datetime import date, datetime, timezone

from quant_workbench.api import (
    ERROR,
    Breadth,
    Coverage,
    DataMeta,
    LimitStats,
    Review,
)


def meta(level: str = "ok", coverage: Coverage | None = None) -> DataMeta:
    return DataMeta(
        as_of=date(2026, 11, 6),
        updated_at=datetime(2026, 11, 6, 15, 32, tzinfo=timezone.utc),
        snapshot_id="snapshot-test",
        level=level,
        coverage=coverage,
    )


class DataMetaTests(unittest.TestCase):
    def test_rejects_unknown_status_level(self) -> None:
        with self.assertRaises(ValueError):
            meta("warning")

    def test_failed_sources_default_to_empty(self) -> None:
        self.assertEqual(meta().failed_sources, ())


class CoverageTests(unittest.TestCase):
    def test_pct_is_none_without_expected_universe(self) -> None:
        self.assertIsNone(Coverage(instruments=0, expected=0).pct)

    def test_pct_is_share_of_expected(self) -> None:
        self.assertEqual(Coverage(instruments=3400, expected=3400).pct, 100.0)


class BreadthTests(unittest.TestCase):
    def test_total_is_derived(self) -> None:
        self.assertEqual(Breadth(up=100, down=80, flat=3).total, 183)


class LimitStatsTests(unittest.TestCase):
    def test_seal_rate_needs_an_attempt(self) -> None:
        self.assertIsNone(LimitStats(sealed_up=0, broken_up=0, sealed_down=40, no_limit=0).seal_rate)

    def test_seal_rate_counts_broken_attempts_in_denominator(self) -> None:
        stats = LimitStats(sealed_up=30, broken_up=10, sealed_down=5, no_limit=2)
        self.assertEqual(stats.touched_up, 40)
        self.assertEqual(stats.seal_rate, 0.75)


class ReviewTests(unittest.TestCase):
    def test_error_payload_still_carries_meta(self) -> None:
        review = Review(
            meta=meta(ERROR),
            is_trading_day=True,
            breadth=Breadth(0, 0, 0),
            limits=LimitStats(0, 0, 0, 0),
        )
        self.assertEqual(review.meta.level, ERROR)
        self.assertEqual(review.ladder, ())

    def test_excluded_defaults_are_independent_per_instance(self) -> None:
        first = Review(meta(), True, Breadth(0, 0, 0), LimitStats(0, 0, 0, 0))
        first.excluded["st"] = 3
        second = Review(meta(), True, Breadth(0, 0, 0), LimitStats(0, 0, 0, 0))
        self.assertEqual(second.excluded, {})


if __name__ == "__main__":
    unittest.main()
