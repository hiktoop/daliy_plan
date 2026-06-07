"""Pydantic models for request/response validation."""

from pydantic import BaseModel


class TaskItem(BaseModel):
    id: str
    text: str = ""
    kind: str = "task"   # "task" | "habit"
    status: str | None = None
    eveningNote: str = ""
    plan: str | None = None
    planId: str | None = None
    planStart: str | None = None


class DayData(BaseModel):
    date: str
    morningTasks: list[TaskItem] = []
    morningNote: str = ""
    eveningNote: str = ""
    savedMorning: bool = False
    savedEvening: bool = False


class SaveDayPayload(BaseModel):
    date: str
    morningTasks: list[TaskItem] = []
    morningNote: str = ""
    eveningNote: str = ""
    savedMorning: bool = False
    savedEvening: bool = False


class PlanItem(BaseModel):
    id: str
    text: str
    plan: str  # 'long', 'week', 'month'
    planStart: str | None = None
    planEnd: str | None = None


class FocusStartPayload(BaseModel):
    task_id: str | None = None
    task_text: str = ""


class FocusStopPayload(BaseModel):
    note: str = ""


class FocusSession(BaseModel):
    id: str
    date: str
    task_id: str | None = None
    task_text: str = ""
    start_ts: float
    end_ts: float | None = None
    duration: int = 0
    note: str = ""


# ── Habits ──

class HabitCreate(BaseModel):
    name: str
    frequency: str = "daily"
    target_value: int = 1
    icon: str = "🏃"
    color: str = "#BA7517"


class HabitItem(BaseModel):
    id: str
    name: str
    frequency: str = "daily"
    target_value: int = 1
    icon: str = "🏃"
    color: str = "#BA7517"
    status: str = "active"
    streak: int = 0
    best: int = 0
    checked_today: bool = False


class HabitLogItem(BaseModel):
    id: str
    habit_id: str
    date: str
    done_value: int = 1
    note: str = ""
