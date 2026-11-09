"""Small, dependency-free canonical models for source adapters.

Adapters may use any upstream representation, but they must produce these models
before data reaches market, research, or backtest code.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
import hashlib
import json
from typing import Any, Mapping


def _require_text(value: str, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string")
    return value.strip()


def _require_date(value: date, field: str) -> date:
    if not isinstance(value, date):
        raise TypeError(f"{field} must be a date")
    return value


def _require_non_negative(value: Decimal, field: str) -> Decimal:
    if value < 0:
        raise ValueError(f"{field} must be non-negative")
    return value


@dataclass(frozen=True, slots=True)
class Instrument:
    """A security identity; status history belongs in a separate dataset."""

    symbol: str
    name: str
    exchange: str
    board: str
    listed_on: date
    is_st: bool = False

    def __post_init__(self) -> None:
        object.__setattr__(self, "symbol", _require_text(self.symbol, "symbol"))
        object.__setattr__(self, "name", _require_text(self.name, "name"))
        object.__setattr__(self, "exchange", _require_text(self.exchange, "exchange"))
        object.__setattr__(self, "board", _require_text(self.board, "board"))
        _require_date(self.listed_on, "listed_on")


@dataclass(frozen=True, slots=True)
class DailyBar:
    """One unambiguous daily bar; adjustment is a dataset-level choice."""

    symbol: str
    trade_date: date
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal
    amount: Decimal
    adjustment: str = "none"

    def __post_init__(self) -> None:
        object.__setattr__(self, "symbol", _require_text(self.symbol, "symbol"))
        _require_date(self.trade_date, "trade_date")
        for field in ("open", "high", "low", "close"):
            _require_non_negative(getattr(self, field), field)
        _require_non_negative(self.volume, "volume")
        _require_non_negative(self.amount, "amount")
        if self.high < max(self.open, self.close) or self.low > min(self.open, self.close):
            raise ValueError("high/low must contain open and close")
        if self.adjustment not in {"none", "forward", "backward"}:
            raise ValueError("adjustment must be none, forward, or backward")


@dataclass(frozen=True, slots=True)
class TradingCalendarEntry:
    trade_date: date
    is_open: bool

    def __post_init__(self) -> None:
        _require_date(self.trade_date, "trade_date")


@dataclass(frozen=True, slots=True)
class DataSnapshot:
    """Immutable reference to one source capture used by a research run."""

    snapshot_id: str
    source: str
    captured_at: datetime
    content_hash: str
    schema_version: str

    def __post_init__(self) -> None:
        for field in ("snapshot_id", "source", "content_hash", "schema_version"):
            value = _require_text(getattr(self, field), field)
            object.__setattr__(self, field, value)
        if self.captured_at.tzinfo is None:
            raise ValueError("captured_at must include a timezone")


@dataclass(frozen=True, slots=True)
class SnapshotManifest:
    """Stable manifest used to derive a reproducible snapshot identifier."""

    source: str
    schema_version: str
    partitions: tuple[str, ...]
    captured_at: datetime

    def __post_init__(self) -> None:
        _require_text(self.source, "source")
        _require_text(self.schema_version, "schema_version")
        if not self.partitions or any(not p.strip() for p in self.partitions):
            raise ValueError("partitions must contain non-empty paths")
        if self.captured_at.tzinfo is None:
            raise ValueError("captured_at must include a timezone")

    def canonical_payload(self) -> Mapping[str, Any]:
        captured = self.captured_at.astimezone(timezone.utc).isoformat()
        return {
            "captured_at": captured,
            "partitions": sorted(self.partitions),
            "schema_version": self.schema_version,
            "source": self.source,
        }

    def snapshot_id(self) -> str:
        payload = json.dumps(self.canonical_payload(), ensure_ascii=True, separators=(",", ":"))
        digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
        return f"snapshot-{digest}"
