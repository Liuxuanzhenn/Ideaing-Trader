import unittest
from datetime import date
from decimal import Decimal

from fixtures import bar, suspended
from quant_workbench.market.calendar import TradingCalendar
from quant_workbench.market.review import (
    BROKEN_UP,
    NO_LIMIT,
    NOT_TRADED,
    SEALED_DOWN,
    SEALED_UP,
    breadth,
    classify_bar,
    limit_stats,
    limit_up_ladder,
    limit_up_streak,
    low_open_high_close,
)

DAY = date(2026, 11, 6)
SESSIONS = TradingCalendar.from_open_days(
    [date(2026, 11, 2), date(2026, 11, 3), date(2026, 11, 4), date(2026, 11, 5), DAY]
)


class CalendarTests(unittest.TestCase):
    def test_previous_and_next_skip_non_sessions(self) -> None:
        self.assertEqual(SESSIONS.previous(date(2026, 11, 8)), DAY)
        self.assertEqual(SESSIONS.next(date(2026, 11, 6)), None)
        self.assertEqual(SESSIONS.previous(date(2026, 11, 2)), None)

    def test_shift_lands_on_sessions(self) -> None:
        self.assertEqual(SESSIONS.shift(date(2026, 11, 5), 1), DAY)
        self.assertEqual(SESSIONS.shift(DAY, -2), date(2026, 11, 4))

    def test_sessions_between_counts_inclusive(self) -> None:
        self.assertEqual(SESSIONS.sessions_between(date(2026, 11, 2), DAY), 5)
        self.assertEqual(SESSIONS.sessions_between(DAY, date(2026, 11, 2)), 0)

    def test_listed_session_number_is_one_based(self) -> None:
        self.assertEqual(SESSIONS.listed_session_number(date(2026, 11, 2), date(2026, 11, 2)), 1)
        self.assertEqual(SESSIONS.listed_session_number(date(2026, 11, 2), DAY), 5)
        self.assertIsNone(SESSIONS.listed_session_number(date(2026, 11, 7), DAY))

    def test_duplicate_or_unsorted_sessions_are_rejected(self) -> None:
        with self.assertRaises(ValueError):
            TradingCalendar((date(2026, 11, 6), date(2026, 11, 5)))


class ClassifyBarTests(unittest.TestCase):
    def test_sealed_limit_up(self) -> None:
        self.assertEqual(classify_bar(bar("600000", DAY, preclose="10.00", open="10.00", high="11.00", low="10.00", close="11.00")), SEALED_UP)

    def test_broken_limit_up_uses_intraday_high(self) -> None:
        self.assertEqual(classify_bar(bar("600000", DAY, preclose="10.00", open="10.50", high="11.00", low="10.20", close="10.60")), BROKEN_UP)

    def test_sealed_limit_down(self) -> None:
        self.assertEqual(classify_bar(bar("600000", DAY, preclose="10.00", open="9.20", high="9.20", low="9.00", close="9.00")), SEALED_DOWN)

    def test_st_uses_five_percent(self) -> None:
        st = bar("600000", DAY, preclose="10.00", open="10.00", high="10.50", low="10.00", close="10.50", is_st=True)
        self.assertEqual(classify_bar(st), SEALED_UP)

    def test_growth_board_uses_twenty_percent(self) -> None:
        growth = bar("300750", DAY, preclose="10.00", open="10.00", high="12.00", low="10.00", close="12.00")
        self.assertEqual(classify_bar(growth), SEALED_UP)

    def test_suspended_bar_is_not_counted(self) -> None:
        self.assertEqual(classify_bar(suspended("600000", DAY, "10.00")), NOT_TRADED)

    def test_new_listing_window_has_no_limit(self) -> None:
        new_stock = bar("688981", DAY, preclose="10.00", open="10.00", high="18.00", low="10.00", close="18.00")
        self.assertEqual(classify_bar(new_stock, new_listing_window=True), NO_LIMIT)


class BreadthTests(unittest.TestCase):
    def test_counts_and_excludes_suspended(self) -> None:
        bars = [
            bar("600000", DAY, preclose="10.00", open="10.00", high="10.50", low="9.90", close="10.50"),
            bar("600001", DAY, preclose="10.00", open="10.00", high="10.10", low="9.50", close="9.60"),
            bar("600002", DAY, preclose="10.00", open="10.00", high="10.10", low="9.90", close="10.00"),
            suspended("600003", DAY, "10.00"),
        ]
        result = breadth(bars)
        self.assertEqual((result.up, result.down, result.flat), (1, 1, 1))
        self.assertEqual(result.total, 3)


class LimitStatsTests(unittest.TestCase):
    def test_seal_rate_and_no_limit_are_separate(self) -> None:
        bars = [
            bar("600000", DAY, preclose="10.00", open="10.00", high="11.00", low="10.00", close="11.00"),
            bar("600001", DAY, preclose="10.00", open="10.50", high="11.00", low="10.20", close="10.60"),
            bar("600002", DAY, preclose="10.00", open="9.20", high="9.20", low="9.00", close="9.00"),
            suspended("600003", DAY, "10.00"),
        ]
        stats = limit_stats(bars)
        self.assertEqual(stats.sealed_up, 1)
        self.assertEqual(stats.broken_up, 1)
        self.assertEqual(stats.sealed_down, 1)
        self.assertEqual(stats.touched_up, 2)
        self.assertEqual(stats.seal_rate, 0.5)

    def test_seal_rate_is_none_without_attempts(self) -> None:
        self.assertIsNone(limit_stats([suspended("600000", DAY, "10.00")]).seal_rate)


class LadderTests(unittest.TestCase):
    def _day(self, day: date, *, sealed: bool) -> object:
        close = "11.00" if sealed else "10.50"
        return bar("600000", day, preclose="10.00", open="10.00", high="11.00", low="10.00", close=close)

    def test_streak_counts_consecutive_sealed_days(self) -> None:
        history = [
            self._day(date(2026, 11, 3), sealed=True),
            self._day(date(2026, 11, 4), sealed=True),
            self._day(date(2026, 11, 5), sealed=False),
            self._day(DAY, sealed=True),
        ]
        self.assertEqual(limit_up_streak(history), 1)

    def test_suspension_breaks_the_streak(self) -> None:
        history = [self._day(date(2026, 11, 5), sealed=True), suspended("600000", DAY, "11.00")]
        self.assertEqual(limit_up_streak(history), 0)

    def test_ladder_buckets_symbols_by_streak(self) -> None:
        ladder = limit_up_ladder(
            [
                [self._day(date(2026, 11, 5), sealed=True), self._day(DAY, sealed=True)],
                [self._day(DAY, sealed=True)],
                [self._day(DAY, sealed=False)],
            ]
        )
        self.assertEqual(ladder, {2: 1, 1: 1})


class LowOpenHighCloseTests(unittest.TestCase):
    def test_reports_hits_with_denominator(self) -> None:
        bars = [
            bar("600000", DAY, preclose="10.00", open="9.95", high="10.20", low="9.90", close="10.10"),
            bar("600001", DAY, preclose="10.00", open="9.95", high="10.00", low="9.80", close="9.90"),
            bar("600002", DAY, preclose="10.00", open="10.05", high="10.20", low="10.00", close="10.10"),
        ]
        result = low_open_high_close(bars, gap=Decimal("0.002"))
        self.assertEqual((result.hits, result.samples), (1, 2))
        self.assertEqual(result.rate, 0.5)

    def test_rejects_non_positive_gap(self) -> None:
        with self.assertRaises(ValueError):
            low_open_high_close([], gap=Decimal("0"))


if __name__ == "__main__":
    unittest.main()
