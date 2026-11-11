import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

from quant_workbench.api import portfolio_store
from quant_workbench.api.portfolio_store import KINDS, PortfolioStore


class PortfolioStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.store = PortfolioStore(Path(self.tmp.name) / "portfolio.json")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_starts_empty_for_both_lists(self) -> None:
        self.assertEqual(self.store.list(), {"watchlist": [], "basket": []})

    def test_add_persists_across_instances(self) -> None:
        self.store.add("watchlist", "SH600000")
        reopened = PortfolioStore(Path(self.tmp.name) / "portfolio.json")
        self.assertEqual(reopened.list()["watchlist"], ["SH600000"])

    def test_adding_twice_does_not_duplicate(self) -> None:
        self.store.add("watchlist", "SH600000")
        state = self.store.add("watchlist", "SH600000")
        self.assertEqual(state["watchlist"], ["SH600000"])

    def test_remove_is_idempotent(self) -> None:
        self.store.add("basket", "SZ000001")
        self.store.remove("basket", "SZ000001")
        self.assertEqual(self.store.remove("basket", "SZ000001")["basket"], [])

    def test_lists_are_independent(self) -> None:
        self.store.add("watchlist", "SH600000")
        self.store.add("basket", "SZ000001")
        state = self.store.list()
        self.assertEqual(state["watchlist"], ["SH600000"])
        self.assertEqual(state["basket"], ["SZ000001"])

    def test_corrupt_file_is_reported_not_silently_reset(self) -> None:
        path = Path(self.tmp.name) / "portfolio.json"
        path.write_text("{not json", encoding="utf-8")
        store = PortfolioStore(path)
        with self.assertRaises(ValueError):
            store.list()

    def test_failed_replace_keeps_the_previous_file_and_removes_the_temp(self) -> None:
        self.store.add("watchlist", "SH600000")
        before = (Path(self.tmp.name) / "portfolio.json").read_text(encoding="utf-8")
        with mock.patch.object(portfolio_store.os, "replace", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                self.store.add("watchlist", "SZ000001")
        after = (Path(self.tmp.name) / "portfolio.json").read_text(encoding="utf-8")
        self.assertEqual(before, after, "a failed replace must not touch the published file")
        leftovers = [item.name for item in Path(self.tmp.name).iterdir() if item.name != "portfolio.json"]
        self.assertEqual(leftovers, [], f"temp files left behind: {leftovers}")
        self.assertEqual(self.store.list()["watchlist"], ["SH600000"])

    def test_failed_write_still_cleans_up_when_writing_fails(self) -> None:
        self.store.add("watchlist", "SH600000")
        with mock.patch.object(portfolio_store.os, "fsync", side_effect=OSError("io error")):
            with self.assertRaises(OSError):
                self.store.add("watchlist", "SZ000001")
        leftovers = [item.name for item in Path(self.tmp.name).iterdir() if item.name != "portfolio.json"]
        self.assertEqual(leftovers, [], f"temp files left behind: {leftovers}")
        self.assertEqual(self.store.list()["watchlist"], ["SH600000"])

    def test_concurrent_adds_lose_no_update(self) -> None:
        symbols = [f"SH{600000 + index:06d}" for index in range(20)]
        barrier = threading.Barrier(len(symbols))

        def worker(symbol: str) -> None:
            barrier.wait()
            PortfolioStore(Path(self.tmp.name) / "portfolio.json").add("watchlist", symbol)

        threads = [threading.Thread(target=worker, args=(symbol,)) for symbol in symbols]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        stored = self.store.list()["watchlist"]
        self.assertEqual(sorted(stored), sorted(symbols), "a concurrent add was lost")
        # the file must also stay valid JSON, i.e. no interleaved writes
        json.loads((Path(self.tmp.name) / "portfolio.json").read_text(encoding="utf-8"))

    def test_concurrent_add_and_remove_keep_the_file_valid(self) -> None:
        self.store.add("basket", "SZ000001")
        barrier = threading.Barrier(10)

        def adder(index: int) -> None:
            barrier.wait()
            PortfolioStore(Path(self.tmp.name) / "portfolio.json").add("basket", f"SZ9{index:05d}")

        def remover() -> None:
            barrier.wait()
            for _ in range(10):
                PortfolioStore(Path(self.tmp.name) / "portfolio.json").remove("basket", "SZ000001")

        threads = [threading.Thread(target=adder, args=(index,)) for index in range(9)]
        threads.append(threading.Thread(target=remover))
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        stored = self.store.list()["basket"]
        self.assertNotIn("SZ000001", stored)
        self.assertEqual(len(stored), 9, f"expected the 9 concurrent adds, got {stored}")
        json.loads((Path(self.tmp.name) / "portfolio.json").read_text(encoding="utf-8"))

    def test_unknown_list_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            self.store.add("favourites", "SH600000")
        with self.assertRaises(ValueError):
            self.store.remove("favourites", "SH600000")
        self.assertIn("watchlist", KINDS)


if __name__ == "__main__":
    unittest.main()
