"""Routes: /api/stats + /api/streaks."""

import json
from datetime import date, timedelta

from fastapi import APIRouter
from backend.db import get_db
from backend.services.plan_service import today_str, offset_date

router = APIRouter(tags=["stats"])


@router.get("/api/stats")
def get_stats(period: str = "all"):
    """Return aggregated stats. period: 'week', 'month', or 'all'."""
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM daily_tasks WHERE saved_morning=1 ORDER BY date ASC"
        ).fetchall()

    today = today_str()

    if period == "week":
        d = date.today()
        monday = d - timedelta(days=d.weekday())
        start = monday.isoformat()
        end = (monday + timedelta(days=6)).isoformat()
        rows = [r for r in rows if start <= r["date"] <= end]

    elif period == "month":
        prefix = today[:7]
        rows = [r for r in rows if r["date"].startswith(prefix)]

    total = 0
    done = 0
    partial = 0
    miss = 0
    for r in rows:
        tasks = json.loads(r["morning_tasks"] or "[]")
        for t in tasks:
            if not t.get("text", "").strip():
                continue
            total += 1
            s = t.get("status")
            if s == "done":
                done += 1
            elif s == "partial":
                partial += 1
            elif s == "miss":
                miss += 1

    return {
        "total": total,
        "done": done,
        "partial": partial,
        "miss": miss,
        "rate": round(done / total * 100) if total > 0 else None,
        "recordedDays": len(rows),
    }


# ── Streaks ──────────────────────────────────────

@router.get("/api/streaks")
def get_all_streaks():
    with get_db() as db:
        rows = db.execute("SELECT * FROM streaks").fetchall()
    return {"streaks": {r["plan_id"]: dict(r) for r in rows}}


@router.post("/api/streaks/{plan_id}")
def update_streak(plan_id: str, date_str: str = "", status: str = ""):
    """Update streak after evening review.
    status: 'done' → increment; anything else → reset to 0."""
    with get_db() as db:
        row = db.execute(
            "SELECT * FROM streaks WHERE plan_id=?", (plan_id,)
        ).fetchone()
        if not row:
            db.execute(
                "INSERT INTO streaks (plan_id, current, best) VALUES (?,0,0)",
                (plan_id,),
            )
            row = {"current": 0, "best": 0, "last_done_date": None}

        cur = row["current"]
        best = row["best"]
        last = row["last_done_date"]

        if status == "done":
            yesterday = offset_date(date_str, -1) if date_str else None
            if last == yesterday:
                cur += 1
            else:
                cur = 1
            last = date_str
            if cur > best:
                best = cur
        else:
            cur = 0

        db.execute(
            "UPDATE streaks SET current=?, best=?, last_done_date=? WHERE plan_id=?",
            (cur, best, last, plan_id),
        )
    return {"ok": True, "current": cur, "best": best}
