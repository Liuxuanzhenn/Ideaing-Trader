import unittest
from datetime import date, datetime, timezone

from quant_workbench.api.repository import resolve_symbol
from quant_workbench.api.stock_service import build_stock

SNAPSHOT = "baostock:2010-01-04..2026-11-06"
UPDATED = datetime(2026, 11, 10, 16, 40, tzinfo=timezone.utc)
DAY = date(2026, 11, 6)


def bar(symbol, day, close, preclose, *, turn=1.5, is_st=False, trading=True):
    volume = 1000.0 if trading else None
    amount = 1.0e7 if trading else None
    return (symbol, day, preclose, close + 0.2, preclose - 0.2, close, preclose, volume, amount, turn, is_st, trading)


class FakeConnection:
    def __init__(self, bars, *, board="Main", streak=(0, 0), matches=None, latest=DAY):
        self.bars = bars
        self.board = board
        self.streak = streak
        self.matches = matches if matches is not None else [("SH600000",)]
        self.latest = latest
        self.calls: list[tuple[str, list]] = []

    def execute(self, query, parameters=None):
        params = list(parameters or [])
        self.calls.append((query, params))
        if "FROM limit_streaks" in query:
            rows = [self.streak]
        elif "FROM instruments WHERE symbol = ?" in query:
            rows = [match for match in self.matches if match[0] == params[0]]
        elif "FROM instruments WHERE right(symbol" in query:
            rows = self.matches
        elif "FROM instruments" in query:
            rows = [(self.board,)]
        elif "max(trade_date)" in query:
            rows = [(self.latest.isoformat() if self.latest else None,)]
        elif "FROM bars" in query:
            # The real query is ORDER BY trade_date DESC LIMIT n
            rows = sorted(
                (row for row in self.bars if row[0] == params[0] and row[1] <= params[1]),
                key=lambda row: row[1],
                reverse=True,
            )[: params[2]]
        else:
            rows = []
        return _Result(rows)


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return list(self._rows)


def history(count, *, last=DAY, symbol="SH600000", start_close=10.0):
    days = []
    value = date(2026, 1, 5)
    close = start_close
    for _ in range(count):
        days.append(bar(symbol, value.isoformat(), close, close - 0.1))
        value = date.fromordinal(value.toordinal() + 1)
        close += 0.1
    return days


class ResolveSymbolTests(unittest.TestCase):
    def test_eight_character_symbol_must_exist_in_instruments(self):
        conn = FakeConnection([], matches=[("SH600000",)])
        self.assertEqual(resolve_symbol(conn, "sh600000"), "SH600000")
        self.assertEqual(len(conn.calls), 1)
        with self.assertRaises(KeyError):
            resolve_symbol(FakeConnection([], matches=[]), "SH999999")

    def test_six_digits_resolve_through_instruments(self):
        conn = FakeConnection([], matches=[("SZ000001",)])
        self.assertEqual(resolve_symbol(conn, "000001"), "SZ000001")

    def test_ambiguous_code_is_rejected_instead_of_guessed(self):
        conn = FakeConnection([], matches=[("SH600000",), ("SZ600000",)])
        with self.assertRaises(ValueError):
            resolve_symbol(conn, "600000")

    def test_unknown_code_raises_key_error(self):
        conn = FakeConnection([], matches=[])
        with self.assertRaises(KeyError):
            resolve_symbol(conn, "999999")

    def test_malformed_code_is_rejected(self):
        with self.assertRaises(ValueError):
            resolve_symbol(FakeConnection([]), "60000")
        with self.assertRaises(ValueError):
            resolve_symbol(FakeConnection([]), "XY600000")


class BuildStockTests(unittest.TestCase):
    def test_latest_trading_bar_sets_price_and_change(self):
        conn = FakeConnection(history(30))
        stock = build_stock(conn, "SH600000", DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertEqual(stock.code, "SH600000")
        self.assertAlmostEqual(stock.price, 12.9)
        self.assertAlmostEqual(stock.chg_pct, ((12.9 / 12.8) - 1) * 100)
        self.assertEqual(stock.price_adjustment, "raw")

    def test_unknown_fields_stay_null_instead_of_being_invented(self):
        stock = build_stock(FakeConnection(history(30)), "SH600000", DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertIsNone(stock.name)
        self.assertIsNone(stock.industry)
        self.assertIsNone(stock.mcap)
        self.assertEqual(stock.concepts, ())

    def test_twenty_day_change_needs_enough_history(self):
        short = build_stock(FakeConnection(history(10)), "SH600000", DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertIsNone(short.stats.chg_20d_pct)
        long = build_stock(FakeConnection(history(30)), "SH600000", DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertIsNotNone(long.stats.chg_20d_pct)

    def test_limit_counts_come_from_the_precomputed_table(self):
        conn = FakeConnection(history(30), streak=(7, 4))
        stock = build_stock(conn, "SH600000", DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertEqual(stock.stats.limit_250, 7)
        self.assertEqual(stock.stats.max_ladder, 4)

    def test_suspended_session_without_new_bar_marks_suspended(self):
        rows = history(30)
        rows[-1] = bar("SH600000", "2026-11-06", 12.9, 12.8, trading=False)
        stock = build_stock(FakeConnection(rows), "SH600000", DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        self.assertEqual(stock.trade_status, "suspended")

    def test_missing_symbol_raises_key_error(self):
        conn = FakeConnection(history(30, symbol="SH600000"))
        with self.assertRaises(KeyError):
            build_stock(conn, "SH600001", DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)

    def test_sorting_of_returned_candles_is_oldest_first(self):
        stock = build_stock(FakeConnection(history(30)), "SH600000", DAY, snapshot_id=SNAPSHOT, updated_at=UPDATED)
        days = [candle.trade_date for candle in stock.candles]
        self.assertEqual(days, sorted(days))


if __name__ == "__main__":
    unittest.main()
