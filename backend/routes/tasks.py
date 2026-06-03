"""Routes: /api/tasks — daily task CRUD."""

import json
import time

from fastapi import APIRouter
from backend.db import get_db
from backend.models import SaveDayPayload, TaskItem
from backend.services.plan_service import get_active_plans, _uid

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _now_ts() -> float:
    return time.time()


def _row_to_day(row) -> dict:
    return {
        "date": row["date"],
        "morningTasks": json.loads(row["morning_tasks"] or "[]"),
        "morningNote": row["morning_note"] or "",
        "eveningNote": row["evening_note"] or "",
        "savedMorning": bool(row["saved_morning"]),
        "savedEvening": bool(row["saved_evening"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


@router.get("")
def list_days():
    """Return all saved days (only those with savedMorning=True)."""
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM daily_tasks WHERE saved_morning=1 ORDER BY date DESC"
        ).fetchall()
    return {"days": [_row_to_day(r) for r in rows]}


@router.get("/{date_str}")
def get_day(date_str: str):
    """Get a single day's data. For new dates, inject active plan snapshots."""
    with get_db() as db:
        row = db.execute(
            "SELECT * FROM daily_tasks WHERE date=?", (date_str,)
        ).fetchone()

    if row:
        return _row_to_day(row)

    # Not in DB — build skeleton with active plan snapshots
    plans = get_active_plans(date_str)
    tasks = [{"id": _uid(), "text": "", "status": None, "eveningNote": "", "plan": None}]
    for p in plans:
        tasks.insert(0, {
            "id": _uid(), "text": p["text"], "status": None, "eveningNote": "",
            "plan": p["plan_type"], "planId": p["id"], "planStart": p.get("plan_start"),
        })
    return {
        "date": date_str,
        "morningTasks": tasks,
        "morningNote": "",
        "eveningNote": "",
        "savedMorning": False,
        "savedEvening": False,
        "createdAt": None,
        "updatedAt": None,
        "_new": True,
    }


@router.post("/{date_str}")
def save_day(date_str: str, payload: SaveDayPayload):
    """Save (upsert) a day's data."""
    tasks_json = json.dumps(
        [t.model_dump(exclude_none=True) for t in payload.morningTasks],
        ensure_ascii=False,
    )
    now_ts = _now_ts()

    with get_db() as db:
        existing = db.execute(
            "SELECT date FROM daily_tasks WHERE date=?", (date_str,)
        ).fetchone()

        if existing:
            db.execute(
                """UPDATE daily_tasks
                   SET morning_tasks=?, morning_note=?, evening_note=?,
                       saved_morning=?, saved_evening=?, updated_at=?
                   WHERE date=?""",
                (tasks_json, payload.morningNote, payload.eveningNote,
                 int(payload.savedMorning), int(payload.savedEvening),
                 now_ts, date_str),
            )
        else:
            db.execute(
                """INSERT INTO daily_tasks
                   (date, morning_tasks, morning_note, evening_note,
                    saved_morning, saved_evening, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (date_str, tasks_json, payload.morningNote, payload.eveningNote,
                 int(payload.savedMorning), int(payload.savedEvening),
                 now_ts, now_ts),
            )

    return {"ok": True, "date": date_str}
