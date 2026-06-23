"""Unit tests for plan_service pure functions."""

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.services.plan_service import (
    _uid,
    today_str,
    offset_date,
    plan_is_active,
)


class TestUid:
    def test_uid_is_12_chars(self):
        uid = _uid()
        assert len(uid) == 12

    def test_uid_is_hex(self):
        uid = _uid()
        assert all(c in "0123456789abcdef" for c in uid)

    def test_uid_is_unique(self):
        uids = {_uid() for _ in range(100)}
        assert len(uids) == 100


class TestTodayStr:
    def test_today_is_iso_format(self):
        ts = today_str()
        parts = ts.split("-")
        assert len(parts) == 3
        assert len(parts[0]) == 4  # year
        assert len(parts[1]) == 2  # month
        assert len(parts[2]) == 2  # day


class TestOffsetDate:
    def test_positive_offset(self):
        result = offset_date("2026-06-23", 5)
        assert result == "2026-06-28"

    def test_negative_offset(self):
        result = offset_date("2026-06-23", -3)
        assert result == "2026-06-20"

    def test_zero_offset(self):
        result = offset_date("2026-06-23", 0)
        assert result == "2026-06-23"

    def test_month_boundary(self):
        result = offset_date("2026-06-30", 2)
        assert result == "2026-07-02"

    def test_year_boundary(self):
        result = offset_date("2026-12-31", 1)
        assert result == "2027-01-01"


class TestPlanIsActive:
    def test_archived_plan_never_active(self):
        plan = {"status": "archived", "plan_start": "2026-01-01", "plan_end": "2030-12-31", "plan_type": "long"}
        assert plan_is_active(plan, "2026-06-23") is False

    def test_long_plan_always_active(self):
        plan = {"status": "active", "plan_start": "2026-01-01", "plan_type": "long"}
        assert plan_is_active(plan, "2026-06-23") is True

    def test_plan_not_started_yet(self):
        plan = {"status": "active", "plan_start": "2026-07-01", "plan_end": "2026-07-31", "plan_type": "week"}
        assert plan_is_active(plan, "2026-06-23") is False

    def test_plan_ended(self):
        plan = {"status": "active", "plan_start": "2026-06-01", "plan_end": "2026-06-15", "plan_type": "week"}
        assert plan_is_active(plan, "2026-06-23") is False

    def test_week_plan_at_start(self):
        plan = {"status": "active", "plan_start": "2026-06-23", "plan_end": "2026-06-30", "plan_type": "week"}
        assert plan_is_active(plan, "2026-06-23") is True

    def test_week_plan_at_end(self):
        plan = {"status": "active", "plan_start": "2026-06-16", "plan_end": "2026-06-23", "plan_type": "week"}
        assert plan_is_active(plan, "2026-06-23") is True

    def test_month_plan_middle(self):
        plan = {"status": "active", "plan_start": "2026-06-01", "plan_end": "2026-06-30", "plan_type": "month"}
        assert plan_is_active(plan, "2026-06-15") is True

    def test_legacy_no_start_date(self):
        plan = {"status": "active", "plan_type": "long"}
        assert plan_is_active(plan, "2026-06-23") is True

    def test_no_status_defaults_active(self):
        plan = {"plan_type": "long", "plan_start": "2026-01-01"}
        assert plan_is_active(plan, "2026-06-23") is True
