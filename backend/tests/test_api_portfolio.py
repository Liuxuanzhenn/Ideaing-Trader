import tempfile
import unittest
from pathlib import Path

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

    def test_unknown_list_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            self.store.add("favourites", "SH600000")
        with self.assertRaises(ValueError):
            self.store.remove("favourites", "SH600000")
        self.assertIn("watchlist", KINDS)


if __name__ == "__main__":
    unittest.main()
