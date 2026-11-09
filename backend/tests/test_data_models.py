import unittest
from datetime import date, datetime, timezone
from decimal import Decimal

from quant_workbench.data import (
    DailyBar,
    Instrument,
    SnapshotManifest,
    TradingCalendarEntry,
)


class InstrumentTests(unittest.TestCase):
    def test_delisted_instrument_keeps_out_date(self) -> None:
        instrument = Instrument(
            symbol="600087",
            name="退市样本",
            exchange="SH",
            board="main",
            listed_on=date(1997, 6, 20),
            delisted_on=date(2014, 6, 5),
        )
        self.assertEqual(instrument.delisted_on, date(2014, 6, 5))

    def test_delisting_before_listing_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            Instrument(
                symbol="600087",
                name="退市样本",
                exchange="SH",
                board="main",
                listed_on=date(2014, 6, 5),
                delisted_on=date(2014, 6, 4),
            )


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
    def test_rejects_datetime_for_trade_date(self) -> None:
        with self.assertRaises(TypeError):
            DailyBar(
                symbol="600000",
                trade_date=datetime(2026, 11, 6, 15, 0),
                open=Decimal("10.0"),
                high=Decimal("10.8"),
                low=Decimal("9.8"),
                close=Decimal("10.5"),
                volume=Decimal("100"),
                amount=Decimal("1050"),
            )

    def test_rejects_non_decimal_and_non_finite_values(self) -> None:
        for value in (10.5, Decimal("Infinity"), Decimal("NaN")):
            with self.subTest(value=value), self.assertRaises((TypeError, ValueError)):
                DailyBar(
                    symbol="600000",
                    trade_date=date(2026, 11, 6),
                    open=value,
                    high=Decimal("10.8"),
                    low=Decimal("9.8"),
                    close=Decimal("10.5"),
                    volume=Decimal("100"),
                    amount=Decimal("1050"),
                )

    def test_rejects_non_boolean_status(self) -> None:
        with self.assertRaises(TypeError):
            TradingCalendarEntry(date(2026, 11, 6), 1)

    def test_suspended_bar_must_have_zero_volume(self) -> None:
        bar = DailyBar(
            symbol="600000",
            trade_date=date(2026, 11, 6),
            open=Decimal("10.0"),
            high=Decimal("10.0"),
            low=Decimal("10.0"),
            close=Decimal("10.0"),
            volume=Decimal("0"),
            amount=Decimal("0"),
            trading=False,
            preclose=Decimal("10.0"),
        )
        self.assertFalse(bar.trading)
        with self.assertRaises(ValueError):
            DailyBar(
                symbol="600000",
                trade_date=date(2026, 11, 6),
                open=Decimal("10.0"),
                high=Decimal("10.0"),
                low=Decimal("10.0"),
                close=Decimal("10.0"),
                volume=Decimal("100"),
                amount=Decimal("1000"),
                trading=False,
            )


class SnapshotManifestTests(unittest.TestCase):
    def test_id_is_independent_of_partition_order(self) -> None:
        captured = datetime(2026, 11, 6, 8, 0, tzinfo=timezone.utc)
        first = SnapshotManifest("source-a", "1", ("b", "a"), captured)
        second = SnapshotManifest("source-a", "1", ("a", "b"), captured)
        self.assertEqual(first.snapshot_id(), second.snapshot_id())

    def test_id_normalizes_partition_paths_and_text(self) -> None:
        captured = datetime(2026, 11, 6, 8, 0, tzinfo=timezone.utc)
        first = SnapshotManifest(" source-a ", "1", ("daily\\\\2026\\\\11",), captured)
        second = SnapshotManifest("source-a", "1", ("daily/2026/11",), captured)
        self.assertEqual(first.snapshot_id(), second.snapshot_id())

    def test_duplicate_and_parent_partitions_are_rejected(self) -> None:
        captured = datetime(2026, 11, 6, 8, 0, tzinfo=timezone.utc)
        for partitions in (("a", "a"), ("../a",)):
            with self.subTest(partitions=partitions), self.assertRaises(ValueError):
                SnapshotManifest("source-a", "1", partitions, captured)

    def test_naive_capture_time_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            SnapshotManifest("source-a", "1", ("a",), datetime(2026, 11, 6, 8, 0))


if __name__ == "__main__":
    unittest.main()
