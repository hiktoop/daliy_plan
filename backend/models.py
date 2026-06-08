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
    # 艾宾浩斯复习字段
    itemType: str | None = None   # None/"knowledge" — None 兼容旧数据
    reviewId: str | None = None   # 关联 reviews 表
    # 来源链接（知识类任务的学习资料 URL）
    sourceUrl: str | None = None


class ReviewItem(BaseModel):
    id: str
    task_text: str
    review_round: int = 0
    next_review: str   # YYYY-MM-DD
    last_review: str | None = None
    status: str = "active"  # "active" | "graduated" | "deleted"
    source_url: str | None = None
    evening_note: str | None = None  # 复习备注（来自晚间复盘）


class ReviewCreate(BaseModel):
    task_text: str
    start_date: str | None = None  # 首次复习日期，默认明天
    source_url: str | None = None   # 来源链接
    evening_note: str | None = None  # 复习备注


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
    duration: int | None = None  # 显式传入时长（秒），倒计时用


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
    note_today: str = ""        # 今日打卡备注


class HabitLogItem(BaseModel):
    id: str
    habit_id: str
    date: str
    done_value: int = 1
    note: str = ""


class CheckInRequest(BaseModel):
    note: str = ""              # 打卡时可选备注
