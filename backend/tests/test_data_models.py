import unittest
from datetime import date, datetime, timezone
from decimal import Decimal

from quant_workbench.data import DailyBar, SnapshotManifest


class DailyBarTests(unittest.TestCase):
    def test_accepts_valid_bar(self) -> None:
        bar = DailyBar(
            symbol="600000",
            trade_date=date(2026, 11, 6),
            open=Decimal("10.0"),
            high=Decimal("10.8"),
            low=Decimal("9.8"),
            close=Decimal("10.5"),
            volume=Decimal("100"),
            amount=Decimal("1050"),
        )
        self.assertEqual(bar.symbol, "600000")

    def test_rejects_inconsistent_high_low(self) -> None:
        with self.assertRaises(ValueError):
            DailyBar(
                symbol="600000",
                trade_date=date(2026, 11, 6),
                open=Decimal("10.0"),
                high=Decimal("9.9"),
                low=Decimal("9.8"),
                close=Decimal("10.5"),
                volume=Decimal("100"),
                amount=Decimal("1050"),
            )


class SnapshotManifestTests(unittest.TestCase):
    def test_id_is_independent_of_partition_order(self) -> None:
        captured = datetime(2026, 11, 6, 8, 0, tzinfo=timezone.utc)
        first = SnapshotManifest("source-a", "1", ("b", "a"), captured)
        second = SnapshotManifest("source-a", "1", ("a", "b"), captured)
        self.assertEqual(first.snapshot_id(), second.snapshot_id())

    def test_naive_capture_time_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            SnapshotManifest("source-a", "1", ("a",), datetime(2026, 11, 6, 8, 0))


if __name__ == "__main__":
    unittest.main()
