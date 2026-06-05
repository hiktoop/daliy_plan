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
