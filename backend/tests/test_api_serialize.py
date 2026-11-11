import json
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal

from quant_workbench.api import Breadth, Coverage, DataMeta, LimitStats, Review
from quant_workbench.api.serialize import review_to_json, to_jsonable

META = DataMeta(
    as_of=date(2026, 11, 6),
    updated_at=datetime(2026, 11, 6, 15, 32, tzinfo=timezone.utc),
    snapshot_id="snapshot-test",
    level="ok",
    coverage=Coverage(instruments=5215, expected=5215),
)


class ToJsonableTests(unittest.TestCase):
    def test_dates_become_iso_strings(self) -> None:
        self.assertEqual(to_jsonable(META)["as_of"], "2026-11-06")
        self.assertEqual(to_jsonable(META)["updated_at"], "2026-11-06T15:32:00+00:00")

    def test_decimals_become_numbers(self) -> None:
        self.assertEqual(to_jsonable({"rate": Decimal("0.75")}), {"rate": 0.75})

    def test_tuples_become_arrays(self) -> None:
        self.assertEqual(to_jsonable(("a", "b")), ["a", "b"])

    def test_plain_values_pass_through(self) -> None:
        self.assertEqual(to_jsonable([1, None, True]), [1, None, True])


class ReviewJsonTests(unittest.TestCase):
    def test_payload_is_valid_json_with_derived_fields(self) -> None:
        review = Review(
            meta=META,
            is_trading_day=True,
            breadth=Breadth(up=3000, down=1800, flat=100),
            limits=LimitStats(sealed_up=30, broken_up=10, sealed_down=2, no_limit=0),
            excluded={"suspended": 42},
        )
        payload = json.loads(review_to_json(review))
        self.assertTrue(payload["is_trading_day"])
        self.assertEqual(payload["limits"]["touched_up"], 40)
        self.assertEqual(payload["limits"]["seal_rate"], 0.75)
        self.assertEqual(payload["excluded"], {"suspended": 42})

    def test_null_rate_survives_serialization(self) -> None:
        review = Review(
            meta=META,
            is_trading_day=True,
            breadth=Breadth(0, 0, 0),
            limits=LimitStats(0, 0, 0, 0),
        )
        payload = json.loads(review_to_json(review))
        self.assertIsNone(payload["limits"]["seal_rate"])


if __name__ == "__main__":
    unittest.main()
