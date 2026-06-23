"""Unit tests for Pydantic request/response models."""

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.models import (
    TaskItem,
    ReviewItem,
    ReviewCreate,
    DayData,
    SaveDayPayload,
    PlanItem,
    FocusStartPayload,
    FocusStopPayload,
    FocusSession,
    HabitCreate,
    HabitItem,
    CheckInRequest,
)


class TestTaskItem:
    def test_minimal_task(self):
        t = TaskItem(id="t001")
        assert t.id == "t001"
        assert t.text == ""
        assert t.kind == "task"
        assert t.status is None

    def test_full_task(self):
        t = TaskItem(id="t002", text="Study math", kind="knowledge", status="todo",
                      plan="week", planId="p001", planStart="2026-06-20",
                      itemType="knowledge", reviewId="r001", sourceUrl="https://example.com")
        assert t.plan == "week"
        assert t.itemType == "knowledge"
        assert t.sourceUrl == "https://example.com"


class TestReviewCreate:
    def test_minimal(self):
        r = ReviewCreate(task_text="Learn Python")
        assert r.task_text == "Learn Python"
        assert r.start_date is None

    def test_with_start_date(self):
        r = ReviewCreate(task_text="Learn Python", start_date="2026-06-24")
        assert r.start_date == "2026-06-24"

    def test_with_source_url(self):
        r = ReviewCreate(task_text="Learn Python", source_url="https://docs.python.org")
        assert r.source_url == "https://docs.python.org"


class TestDayData:
    def test_empty_day(self):
        d = DayData(date="2026-06-23")
        assert d.date == "2026-06-23"
        assert d.morningTasks == []
        assert d.savedMorning is False

    def test_day_with_tasks(self):
        d = DayData(date="2026-06-23", morningTasks=[
            TaskItem(id="t001", text="Task 1"),
            TaskItem(id="t002", text="Task 2"),
        ])
        assert len(d.morningTasks) == 2


class TestFocusStopPayload:
    def test_defaults(self):
        p = FocusStopPayload()
        assert p.note == ""
        assert p.duration is None

    def test_with_duration(self):
        p = FocusStopPayload(duration=1500)
        assert p.duration == 1500

    def test_with_note(self):
        p = FocusStopPayload(note="Completed chapter 3")
        assert p.note == "Completed chapter 3"


class TestHabitCreate:
    def test_defaults(self):
        h = HabitCreate(name="Run")
        assert h.name == "Run"
        assert h.frequency == "daily"
        assert h.target_value == 1
        assert h.icon == "\U0001f3c3"
        assert h.color == "#BA7517"

    def test_custom_values(self):
        h = HabitCreate(name="Read", frequency="weekly", target_value=3, icon="\U0001f4da", color="#378ADD")
        assert h.target_value == 3
        assert h.color == "#378ADD"


class TestCheckInRequest:
    def test_default_no_note(self):
        r = CheckInRequest()
        assert r.note == ""

    def test_with_note(self):
        r = CheckInRequest(note="Did 5km")
        assert r.note == "Did 5km"
