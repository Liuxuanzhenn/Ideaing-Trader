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
        self.null_price = 0
        self.ladder = [("SZ300446", 25, True)]
        self.stats = [
            ("2026-11-06", 500, 400, 60, 33, 16, 15, 49, 0.6734, 5, 12, 1.5e12),
        ]
        self.index_closes = [("sh.000300", "沪深300", "2026-11-06", 4012.5)]
        self.amount = 1.5e12
        self.previous = "2026-11-05"
        self.promotion = [(1, 18, 3)]
        self.prev_limit = [5.2, -1.0, 3.0]
        self.sessions = sessions if sessions is not None else [
            (f"2026-11-{day:02d}",) for day in range(1, 7)
        ]
        self.calls: list[tuple[str, list | None]] = []

    def execute(self, query: str, parameters=None):
        self.calls.append((query, parameters))
        if "IS NULL" in query:
            rows = [(self.null_price,)]
        elif "sum(amount)" in query:
            rows = [(self.amount,)]
        elif "max(trade_date) FROM bars WHERE trade_date <" in query:
            rows = [(self.previous,)]
        elif "WITH prev AS (SELECT symbol, streak" in query:
            rows = self.promotion
        elif "WITH prev AS (SELECT symbol FROM limit_streaks" in query:
            rows = [(value,) for value in self.prev_limit]
        elif "FROM session_stats" in query:
            # The real query is ORDER BY trade_date DESC LIMIT n
            rows = sorted(self.stats, key=lambda item: item[0], reverse=True)
        elif "FROM index_bars" in query:
            rows = self.index_closes if "b.trade_date <=" in query else self.indices
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
        # ST is excluded by default, so the ladder matches the sealed-up count above it.
        self.assertEqual(ladder_calls[0][1], ["2026-11-06", 2, False])


class NullPriceRowTests(unittest.TestCase):
    def _null_price_row(self, symbol: str) -> tuple:
        return (symbol, "2026-11-06", None, None, None, None, None, None, None, None, 0, False)

    def test_row_without_any_price_is_dropped_not_zeroed(self) -> None:
        conn = FakeConnection(
            [row("SH600000", preclose=10.0, close=10.2, high=10.3), self._null_price_row("SZ000022")]
        )
        bars = fetch_session_bars(conn, DAY)
        self.assertEqual([bar.symbol for bar in bars], ["SH600000"])

    def test_dropped_rows_are_reported_in_excluded(self) -> None:
        conn = FakeConnection(
            [row("SH600000", preclose=10.0, close=10.2, high=10.3), self._null_price_row("SZ000022")]
        )
        conn.null_price = 1
        review = build_review(conn, DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertEqual(review.excluded["no_price"], 1)
        self.assertEqual(review.breadth.total, 1)


class SeriesTests(unittest.TestCase):
    def test_series_comes_from_session_stats_oldest_first(self) -> None:
        conn = FakeConnection([row("SH600000")])
        conn.stats = [
            ("2026-11-05", 400, 500, 50, 20, 10, 30, 30, 0.6666, 4, 8, 1.4e12),
            ("2026-11-06", 500, 400, 60, 33, 16, 15, 49, 0.6734, 5, 12, 1.5e12),
        ]
        review = build_review(conn, DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertEqual(review.series.dates, (date(2026, 11, 5), date(2026, 11, 6)))
        self.assertEqual(review.series.sealed_up, (20, 33))
        self.assertEqual(review.series.max_ladder, (4, 5))
        self.assertEqual(review.series.broken_up, (10, 16))

    def test_red_ratio_is_none_when_nothing_was_counted(self) -> None:
        conn = FakeConnection([row("SH600000")])
        conn.stats = [("2026-11-06", 0, 0, 0, 0, 0, 0, 0, None, 0, 0, 0.0)]
        review = build_review(conn, DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertIsNone(review.series.red_ratio[0])
        self.assertIsNone(review.series.seal_rate[0])

    def test_index_closes_align_with_dates_and_keep_gaps_empty(self) -> None:
        conn = FakeConnection([row("SH600000")])
        conn.stats = [
            ("2026-11-05", 1, 1, 1, 1, 0, 0, 1, 1.0, 1, 0, 1.0),
            ("2026-11-06", 1, 1, 1, 1, 0, 0, 1, 1.0, 1, 0, 1.0),
        ]
        conn.index_closes = [("sh.000300", "沪深300", "2026-11-06", 4012.5)]
        review = build_review(conn, DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertEqual(review.series.indices[0].name, "沪深300")
        self.assertEqual(review.series.indices[0].closes, (None, 4012.5))

    def test_missing_session_stats_yields_an_empty_series(self) -> None:
        conn = FakeConnection([row("SH600000")])
        conn.stats = []
        review = build_review(conn, DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertEqual(review.series.dates, ())
        self.assertEqual(review.series.sealed_up, ())


class MarketExtraTests(unittest.TestCase):
    def test_amount_promotion_and_previous_limit_are_filled(self) -> None:
        conn = FakeConnection([row("SH600000")])
        conn.amount = 1.5e12
        conn.promotion = [(1, 18, 3), (2, 6, 1)]
        conn.prev_limit = [5.2, -1.0, 3.0, 9.8]
        review = build_review(conn, DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertAlmostEqual(review.market.amount, 1.5e12)
        self.assertEqual([step.level for step in review.market.promotion], [1, 2])
        self.assertAlmostEqual(review.market.promotion[0].rate, 3 / 18)
        self.assertEqual(review.market.prev_limit.samples, 4)
        self.assertAlmostEqual(review.market.prev_limit.median_pct, (3.0 + 5.2) / 2)
        self.assertAlmostEqual(review.market.prev_limit.up_ratio, 0.75)

    def test_no_previous_session_keeps_turnover_but_drops_promotion(self) -> None:
        conn = FakeConnection([row("SH600000")])
        conn.previous = None
        review = build_review(conn, DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertAlmostEqual(review.market.amount, conn.amount)
        self.assertEqual(review.market.promotion, ())
        self.assertIsNone(review.market.prev_limit)

    def test_empty_previous_limit_sample_is_none_not_zero(self) -> None:
        conn = FakeConnection([row("SH600000")])
        conn.prev_limit = []
        review = build_review(conn, DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertIsNone(review.market.prev_limit)

    def test_zero_base_promotion_rate_is_none(self) -> None:
        conn = FakeConnection([row("SH600000")])
        conn.promotion = [(1, 0, 0)]
        review = build_review(conn, DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertIsNone(review.market.promotion[0].rate)


class LadderExclusionTests(unittest.TestCase):
    def test_default_ladder_excludes_st(self) -> None:
        conn = FakeConnection([row("SH600000")])
        build_review(conn, DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        params = [call[1] for call in conn.calls if "FROM limit_streaks" in call[0]][0]
        self.assertFalse(params[2])

    def test_ladder_includes_st_when_exclusion_is_off(self) -> None:
        conn = FakeConnection([row("SH600000")])
        build_review(conn, DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED, exclude_st=False)
        params = [call[1] for call in conn.calls if "FROM limit_streaks" in call[0]][0]
        self.assertTrue(params[2])
