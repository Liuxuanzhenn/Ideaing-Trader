import unittest
from datetime import date, datetime, timezone
from decimal import Decimal

from quant_workbench.api import EMPTY, OK
from quant_workbench.api.repository import fetch_session_bar_count, fetch_session_bars
from quant_workbench.api.review_service import build_review

DAY = date(2026, 11, 6)
UPDATED = datetime(2026, 11, 6, 15, 32, tzinfo=timezone.utc)
SNAPSHOT = "snapshot-test"


class FakeConnection:
    """Stands in for duckdb; routes each query to canned rows by table name."""

    def __init__(
        self,
        bars: list[tuple],
        *,
        instruments: list[tuple] | None = None,
        sessions: list[tuple] | None = None,
    ) -> None:
        self.bars = bars
        self.instruments = instruments if instruments is not None else [("SH600000", "2026-11-01")]
        self.indices = [("sh.000300", "沪深300", 4012.5, 0.82, 3.1e11)]
        self.ladder = [("SZ300446", 25, True)]
        self.sessions = sessions if sessions is not None else [
            (f"2026-11-{day:02d}",) for day in range(1, 7)
        ]
        self.calls: list[tuple[str, list | None]] = []

    def execute(self, query: str, parameters=None):
        self.calls.append((query, parameters))
        if "FROM index_bars" in query:
            rows = self.indices
        elif "FROM limit_streaks" in query:
            rows = self.ladder
        elif "count(*)" in query:
            rows = [(len(self.bars),)]
        elif "FROM instruments" in query:
            rows = self.instruments
        elif "DISTINCT trade_date" in query:
            rows = self.sessions
        else:
            rows = self.bars

        class _Result:
            def fetchall(self_inner):
                return rows

        return _Result()


def row(
    symbol: str,
    *,
    close: float = 11.0,
    preclose: float = 10.0,
    trading: bool = True,
    is_st: bool = False,
    open_price: float = 10.0,
    high: float = 11.0,
    low: float = 9.9,
    volume: float = 1000.0,
) -> tuple:
    return (
        symbol,
        "2026-11-06",
        open_price,
        high,
        low,
        close,
        preclose,
        volume,
        1000.0,
        1.5,
        1 if is_st else 0,
        trading,
    )


class RepositoryTests(unittest.TestCase):
    def test_converts_row_to_canonical_bar(self) -> None:
        conn = FakeConnection([row("SH600000")])
        bars = fetch_session_bars(conn, DAY)
        self.assertEqual(len(bars), 1)
        self.assertEqual(bars[0].symbol, "SH600000")
        self.assertEqual(bars[0].trade_date, DAY)
        self.assertEqual(bars[0].close, Decimal("11"))
        self.assertFalse(bars[0].is_st)

    def test_queries_with_iso_date_string(self) -> None:
        conn = FakeConnection([])
        fetch_session_bars(conn, DAY)
        self.assertEqual(conn.calls[0][1], ["2026-11-06"])

    def test_bar_count_returns_int(self) -> None:
        conn = FakeConnection([row(f"SH60000{index}") for index in range(3)])
        self.assertEqual(fetch_session_bar_count(conn, DAY), 3)


class ReviewServiceTests(unittest.TestCase):
    def test_empty_session_is_reported_as_not_a_trading_day(self) -> None:
        review = build_review(FakeConnection([]), DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertFalse(review.is_trading_day)
        self.assertEqual(review.meta.level, EMPTY)
        self.assertIsNone(review.limits.seal_rate)

    def test_counts_limit_ups_and_excludes_st(self) -> None:
        bars = [
            row("SH600000", preclose=10.0, close=11.0, high=11.0),
            row("SH600001", preclose=10.0, close=10.6, high=11.0),
            row("SH600002", preclose=10.0, close=10.0, high=10.2),
            row("SH600003", preclose=10.0, close=10.5, high=10.5, is_st=True),
        ]
        review = build_review(FakeConnection(bars), DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertEqual(review.limits.sealed_up, 1)
        self.assertEqual(review.limits.broken_up, 1)
        self.assertEqual(review.excluded["st"], 1)
        self.assertEqual(review.breadth.total, 3)
        self.assertEqual(review.meta.level, OK)

    def test_st_flag_contradicted_by_a_large_move_is_not_excluded(self) -> None:
        """A main-board stock moving 10% cannot have been under the 5% ST cap."""
        bars = [row("SH600003", preclose=10.0, close=10.9, high=10.9, is_st=True)]
        review = build_review(FakeConnection(bars), DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertNotIn("st", review.excluded)
        self.assertEqual(review.breadth.total, 1)

    def test_including_st_when_exclusion_is_off(self) -> None:
        bars = [row("SH600003", preclose=10.0, close=10.5, high=10.5, is_st=True)]
        review = build_review(FakeConnection(bars), DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED, exclude_st=False)
        self.assertEqual(review.limits.sealed_up, 1)
        self.assertNotIn("st", review.excluded)

    def test_suspended_rows_are_reported_not_counted(self) -> None:
        bars = [
            row("SH600000", preclose=10.0, close=10.2, high=10.3),
            row("SH600001", preclose=10.0, close=10.0, high=10.0, trading=False, volume=0.0),
        ]
        review = build_review(FakeConnection(bars), DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertEqual(review.excluded["suspended"], 1)
        self.assertEqual(review.breadth.total, 1)


if __name__ == "__main__":
    unittest.main()


class NullVolumeTests(unittest.TestCase):
    def test_suspended_row_with_null_volume_becomes_zero(self) -> None:
        nullable = list(row("SH688121", trading=False))
        nullable[7] = None  # volume
        nullable[8] = None  # amount
        bars = fetch_session_bars(FakeConnection([tuple(nullable)]), DAY)
        self.assertEqual(bars[0].volume, Decimal("0"))
        self.assertEqual(bars[0].amount, Decimal("0"))
        self.assertFalse(bars[0].trading)

    def test_traded_row_with_null_volume_is_an_error(self) -> None:
        broken = list(row("SH600000"))
        broken[7] = None
        with self.assertRaises(ValueError) as caught:
            fetch_session_bars(FakeConnection([tuple(broken)]), DAY)
        self.assertIn("SH600000", str(caught.exception))
        self.assertIn("volume", str(caught.exception))


class IndexAndLadderTests(unittest.TestCase):
    def test_indices_and_ladder_are_returned(self) -> None:
        bars = [row("SH600000", preclose=10.0, close=11.0, high=11.0)]
        review = build_review(FakeConnection(bars), DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertEqual(len(review.indices), 1)
        self.assertEqual(review.indices[0].name, "沪深300")
        self.assertAlmostEqual(review.indices[0].close, 4012.5)
        self.assertEqual(len(review.ladder), 1)
        self.assertEqual(review.ladder[0].streak, 25)
        self.assertTrue(review.ladder[0].is_one_word)
        self.assertIsNone(review.ladder[0].name)

    def test_ladder_query_asks_for_streaks_of_two_or_more(self) -> None:
        conn = FakeConnection([row("SH600000")])
        build_review(conn, DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        ladder_calls = [call for call in conn.calls if "FROM limit_streaks" in call[0]]
        self.assertEqual(ladder_calls[0][1], ["2026-11-06", 2])
