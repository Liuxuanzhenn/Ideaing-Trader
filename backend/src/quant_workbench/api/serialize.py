"""JSON encoding for contract objects.

Dates become ISO strings, decimals become JSON numbers (the frontend formats them),
and tuples become arrays. Keeping this in one place stops each endpoint from
inventing its own decimal formatting.
"""

from __future__ import annotations

import json
from dataclasses import fields, is_dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from .contracts import Review


def to_jsonable(value: Any) -> Any:
    if is_dataclass(value) and not isinstance(value, type):
        return {field.name: to_jsonable(getattr(value, field.name)) for field in fields(value)}
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): to_jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [to_jsonable(item) for item in value]
    return value


def review_to_json(review: Review) -> str:
    return json.dumps(to_jsonable(review), ensure_ascii=False, indent=2)
