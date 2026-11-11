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
from pathlib import PurePosixPath
from typing import Any, Mapping


def _require_text(value: str, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string")
    return value.strip()


def _require_date(value: date, field: str) -> date:
    if type(value) is not date:
        raise TypeError(f"{field} must be a date without a time")
    return value


def _require_non_negative(value: Decimal, field: str) -> Decimal:
    if not isinstance(value, Decimal):
        raise TypeError(f"{field} must be a Decimal")
    if not value.is_finite() or value < 0:
        raise ValueError(f"{field} must be finite and non-negative")
    return value


def _canonical_partition(value: str) -> str:
    value = _require_text(value, "partition").replace("\\", "/")
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError("partition must be a relative path without parent traversal")
    return path.as_posix()


@dataclass(frozen=True, slots=True)
class Instrument:
    """A security identity; per-day ST and trading state live on DailyBar.

    Delisted instruments are kept so backtests do not inherit survivorship bias.
    """

    symbol: str
    name: str
    exchange: str
    board: str
    listed_on: date
    delisted_on: date | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "symbol", _require_text(self.symbol, "symbol"))
        object.__setattr__(self, "name", _require_text(self.name, "name"))
        object.__setattr__(self, "exchange", _require_text(self.exchange, "exchange"))
        object.__setattr__(self, "board", _require_text(self.board, "board"))
        _require_date(self.listed_on, "listed_on")
        if self.delisted_on is not None:
            _require_date(self.delisted_on, "delisted_on")
            if self.delisted_on < self.listed_on:
                raise ValueError("delisted_on must not precede listed_on")


@dataclass(frozen=True, slots=True)
class DailyBar:
    """One unambiguous daily bar; adjustment is a dataset-level choice.

    Trading state and ST flag live on the bar because baostock reports them per
    day; deriving status history from bars avoids a second source of truth.

    Sources carry a suspended day's close forward, so a bar with trading=False has
    a reference price but no tradable OHLC; only its price fields are unchecked.

    `trading` means "shares actually changed hands today", derived by the adapter as
    source tradestatus and a positive volume. Sources disagree at the edges: the last
    session before delisting can carry tradestatus=1 with no volume and a
    carried-forward close, which must not be treated as a tradable bar.
    """


    symbol: str
    trade_date: date
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal
    amount: Decimal
    adjustment: str = "none"
    preclose: Decimal | None = None
    trading: bool = True
    is_st: bool = False
    turn: Decimal | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "symbol", _require_text(self.symbol, "symbol"))
        _require_date(self.trade_date, "trade_date")
        if not isinstance(self.adjustment, str):
            raise TypeError("adjustment must be a string")
        for field in ("open", "high", "low", "close"):
            _require_non_negative(getattr(self, field), field)
        _require_non_negative(self.volume, "volume")
        _require_non_negative(self.amount, "amount")
        if self.preclose is not None:
            _require_non_negative(self.preclose, "preclose")
        if not isinstance(self.trading, bool):
            raise TypeError("trading must be a bool")
        if self.trading and self.volume <= 0:
            raise ValueError("a traded bar must carry positive volume")
        if not isinstance(self.is_st, bool):
            raise TypeError("is_st must be a bool")
        if self.turn is not None:
            _require_non_negative(self.turn, "turn")
        if not self.trading and self.volume != 0:
            raise ValueError("a suspended bar cannot carry volume")
        if self.trading and (
            self.high < max(self.open, self.close) or self.low > min(self.open, self.close)
        ):
            raise ValueError("high/low must contain open and close")
        if self.adjustment not in {"none", "forward", "backward"}:
            raise ValueError("adjustment must be none, forward, or backward")


@dataclass(frozen=True, slots=True)
class TradingCalendarEntry:
    trade_date: date
    is_open: bool

    def __post_init__(self) -> None:
        _require_date(self.trade_date, "trade_date")
        if not isinstance(self.is_open, bool):
            raise TypeError("is_open must be a bool")


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
        source = _require_text(self.source, "source")
        schema_version = _require_text(self.schema_version, "schema_version")
        object.__setattr__(self, "source", source)
        object.__setattr__(self, "schema_version", schema_version)
        if not self.partitions:
            raise ValueError("partitions must contain at least one path")
        partitions = tuple(_canonical_partition(p) for p in self.partitions)
        if len(set(partitions)) != len(partitions):
            raise ValueError("partitions must not contain duplicates")
        object.__setattr__(self, "partitions", partitions)
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
