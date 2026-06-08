"""Focus timer (Pomodoro) routes."""

import time
from fastapi import APIRouter

from backend.db import get_db
from backend.models import FocusStartPayload, FocusStopPayload

router = APIRouter(prefix="/api/focus", tags=["focus"])

def _uid():
    import random, string
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))


@router.post("/start")
def start_focus(payload: FocusStartPayload):
    now = time.time()
    today = time.strftime("%Y-%m-%d", time.localtime(now))
    sid = _uid()
    with get_db() as db:
        db.execute(
            "INSERT INTO focus_sessions (id, date, task_id, task_text, start_ts) VALUES (?, ?, ?, ?, ?)",
            (sid, today, payload.task_id, payload.task_text, now)
        )
    return {"id": sid, "date": today, "start_ts": now}


@router.post("/{session_id}/stop")
def stop_focus(session_id: str, payload: FocusStopPayload = FocusStopPayload()):
    now = time.time()
    with get_db() as db:
        row = db.execute("SELECT * FROM focus_sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            return {"error": "session not found"}
        if row["end_ts"] is not None:
            return {"error": "session already stopped"}
        duration = payload.duration if payload.duration else int(now - row["start_ts"])
        db.execute(
            "UPDATE focus_sessions SET end_ts = ?, duration = ?, note = ? WHERE id = ?",
            (now, duration, payload.note, session_id)
        )
        row2 = db.execute("SELECT * FROM focus_sessions WHERE id = ?", (session_id,)).fetchone()
    return {
        "id": row2["id"], "date": row2["date"],
        "task_id": row2["task_id"], "task_text": row2["task_text"],
        "start_ts": row2["start_ts"], "end_ts": row2["end_ts"],
        "duration": row2["duration"], "note": row2["note"]
    }


@router.get("/{date}")
def get_sessions(date: str):
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM focus_sessions WHERE date = ? ORDER BY start_ts DESC",
            (date,)
        ).fetchall()
    sessions = [dict(r) for r in rows]
    total_sec = sum(s["duration"] for s in sessions)
    return {"date": date, "sessions": sessions, "total_seconds": total_sec}


@router.get("/stats/summary")
def get_focus_stats(days: int = 30):
    with get_db() as db:
        rows = db.execute(
            """SELECT date, SUM(duration) as total_sec, COUNT(*) as session_count
               FROM focus_sessions WHERE duration > 0
               GROUP BY date ORDER BY date DESC LIMIT ?""",
            (days,)
        ).fetchall()
    return {"stats": [dict(r) for r in rows]}


@router.delete("/{session_id}")
def delete_session(session_id: str):
    with get_db() as db:
        db.execute("DELETE FROM focus_sessions WHERE id = ?", (session_id,))
    return {"ok": True}
