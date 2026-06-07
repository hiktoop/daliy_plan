"""Routes: /api/habits — habit tracking."""

import uuid
import time
from datetime import date as dt_date, timedelta

from fastapi import APIRouter, Query
from backend.db import get_db
from backend.models import HabitCreate, HabitItem

router = APIRouter(prefix="/api/habits", tags=["habits"])

ICONS = ["🏃","💧","📖","🧘","💪","🎯","✍️","🌅","🎵","🍎","💤","📝","🧹","🌿","💻"]
COLORS = ["#BA7517","#378ADD","#639922","#D4537E","#534AB7","#1D9E75","#D85A30","#993556"]


def _uid():
    return uuid.uuid4().hex[:8]


def _today() -> str:
    return dt_date.today().isoformat()


def _calc_streak(db, habit_id: str, today: str) -> tuple[int, int]:
    """Return (current_streak, best_streak) for a habit."""
    rows = db.execute(
        "SELECT date FROM habit_logs WHERE habit_id = ? ORDER BY date DESC",
        (habit_id,)
    ).fetchall()
    if not rows:
        return 0, 0

    dates = [r["date"] for r in rows]

    # current streak: count consecutive days backwards from today
    current = 0
    cursor = today
    for d in dates:
        if d == cursor:
            current += 1
            cursor = (dt_date.fromisoformat(cursor) - timedelta(days=1)).isoformat()
        elif d < cursor:
            break
    # if today is not checked and cursor == today, that's fine — streak counts until last check

    # best streak: longest consecutive run in all dates
    best = 0
    run = 1
    for i in range(1, len(dates)):
        prev = dt_date.fromisoformat(dates[i - 1])
        cur = dt_date.fromisoformat(dates[i])
        if (prev - cur).days == 1:
            run += 1
        else:
            if run > best:
                best = run
            run = 1
    if run > best:
        best = run

    return current, best


# ── CRUD ──

@router.get("")
def list_habits():
    today = _today()
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM habits WHERE status = 'active' ORDER BY created_at"
        ).fetchall()

    result = []
    for r in rows:
        h = dict(r)
        with get_db() as db:
            cur, best = _calc_streak(db, h["id"], today)
            checked = db.execute(
                "SELECT 1 FROM habit_logs WHERE habit_id = ? AND date = ?",
                (h["id"], today)
            ).fetchone() is not None
        h["streak"] = cur
        h["best"] = best
        h["checked_today"] = checked
        result.append(h)
    return {"habits": result}


@router.post("")
def create_habit(payload: HabitCreate):
    hid = _uid()
    now = time.time()
    with get_db() as db:
        db.execute(
            """INSERT INTO habits (id, name, frequency, target_value, icon, color, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, 'active', ?)""",
            (hid, payload.name, payload.frequency, payload.target_value,
             payload.icon, payload.color, now)
        )
    return {"ok": True, "id": hid}


@router.put("/{habit_id}")
def update_habit(habit_id: str, payload: HabitCreate):
    with get_db() as db:
        db.execute(
            """UPDATE habits SET name=?, frequency=?, target_value=?, icon=?, color=?
               WHERE id=?""",
            (payload.name, payload.frequency, payload.target_value,
             payload.icon, payload.color, habit_id)
        )
    return {"ok": True}


@router.delete("/{habit_id}")
def archive_habit(habit_id: str):
    with get_db() as db:
        db.execute("UPDATE habits SET status='archived' WHERE id=?", (habit_id,))
    return {"ok": True}


# ── Check-in ──

@router.post("/{habit_id}/check")
def check_in(habit_id: str):
    today = _today()
    with get_db() as db:
        existing = db.execute(
            "SELECT id FROM habit_logs WHERE habit_id=? AND date=?",
            (habit_id, today)
        ).fetchone()
        if existing:
            return {"ok": True, "already_checked": True}

        db.execute(
            "INSERT INTO habit_logs (id, habit_id, date, created_at) VALUES (?,?,?,?)",
            (_uid(), habit_id, today, time.time())
        )
    return {"ok": True}


@router.delete("/{habit_id}/check")
def uncheck(habit_id: str):
    today = _today()
    with get_db() as db:
        db.execute(
            "DELETE FROM habit_logs WHERE habit_id=? AND date=?",
            (habit_id, today)
        )
    return {"ok": True}


# ── Logs & heatmap ──

@router.get("/{habit_id}/logs")
def get_logs(habit_id: str, days: int = Query(30, ge=1, le=730)):
    since = (dt_date.today() - timedelta(days=days - 1)).isoformat()
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM habit_logs WHERE habit_id=? AND date >= ? ORDER BY date ASC",
            (habit_id, since)
        ).fetchall()
    return {"logs": [dict(r) for r in rows]}


@router.get("/heatmap")
def get_heatmap(days: int = Query(84, ge=1, le=730)):
    """Return checked dates for all habits in range, for heatmap rendering."""
    since = (dt_date.today() - timedelta(days=days - 1)).isoformat()
    with get_db() as db:
        rows = db.execute(
            """SELECT hl.habit_id, hl.date, h.name, h.icon, h.color
               FROM habit_logs hl JOIN habits h ON hl.habit_id = h.id
               WHERE hl.date >= ? AND h.status = 'active'
               ORDER BY hl.date""",
            (since,)
        ).fetchall()
    return {"heatmap": [dict(r) for r in rows]}
