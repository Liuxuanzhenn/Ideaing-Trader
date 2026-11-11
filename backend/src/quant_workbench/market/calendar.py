"""Trading calendar over a fixed set of open sessions.

All T+N arithmetic goes through here; natural-day offsets are wrong across
weekends, holidays and suspension periods.
"""

from __future__ import annotations

from bisect import bisect_left, bisect_right
from dataclasses import dataclass
from datetime import date
from typing import Iterable


@dataclass(frozen=True, slots=True)
class TradingCalendar:
    sessions: tuple[date, ...]

    def __post_init__(self) -> None:
        if not self.sessions:
            raise ValueError("calendar must contain at least one session")
        if any(later <= earlier for earlier, later in zip(self.sessions, self.sessions[1:])):
            raise ValueError("calendar sessions must be strictly ascending")

    @classmethod
    def from_open_days(cls, days: Iterable[date]) -> "TradingCalendar":
        unique = sorted(set(days))
        if not unique:
            raise ValueError("calendar must contain at least one session")
        return cls(tuple(unique))

    def is_open(self, day: date) -> bool:
        index = bisect_left(self.sessions, day)
        return index < len(self.sessions) and self.sessions[index] == day

    def previous(self, day: date) -> date | None:
        """Last session strictly before `day`."""
        index = bisect_left(self.sessions, day) - 1
        return self.sessions[index] if index >= 0 else None

    def next(self, day: date) -> date | None:
        """First session strictly after `day`."""
        index = bisect_right(self.sessions, day)
        return self.sessions[index] if index < len(self.sessions) else None

    def shift(self, day: date, sessions: int) -> date | None:
        """Session `sessions` steps after (`>0`) or before (`<0`) `day`."""
        index = bisect_left(self.sessions, day)
        if index == len(self.sessions) or self.sessions[index] != day:
            index = bisect_right(self.sessions, day) - 1
        target = index + sessions
        return self.sessions[target] if 0 <= target < len(self.sessions) else None

    def sessions_between(self, start: date, end: date) -> int:
        """Count open sessions in the inclusive range, 0 when start > end."""
        if start > end:
            return 0
        return bisect_right(self.sessions, end) - bisect_left(self.sessions, start)

    def listed_session_number(self, listed_on: date, day: date) -> int | None:
        """1-based session number of `day` since listing; None when unavailable.

        Callers use this to decide the new-listing window in which daily price
        limits do not apply.
        """
        if day < listed_on:
            return None
        if not self.is_open(day):
            return None
        return bisect_right(self.sessions, day) - bisect_left(self.sessions, listed_on)
