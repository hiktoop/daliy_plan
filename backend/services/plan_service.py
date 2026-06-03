"""Plan lifecycle services — snapshot, archive, active check."""

import json
import uuid
import time
from datetime import date, timedelta

from backend.db import get_db


def _uid() -> str:
    return uuid.uuid4().hex[:12]


def _now_ts() -> float:
    return time.time()


def today_str() -> str:
    return date.today().isoformat()


def offset_date(date_str: str, delta: int) -> str:
    d = date.fromisoformat(date_str) + timedelta(days=delta)
    return d.isoformat()


def plan_is_active(r: dict, target_date: str) -> bool:
    """Check if a plan is active on target_date.
    Archived plans are never active."""
    if r.get("status") == "archived":
        return False
    start = r.get("plan_start", "")
    end = r.get("plan_end", "")
    if start and target_date < start:
        return False
    if r["plan_type"] == "long":
        return True  # no end = indefinite
    if not start:
        return True  # legacy
    return target_date <= (end or start)


def get_active_plans(date_str: str) -> list[dict]:
    """Return all active plans on a given date."""
    with get_db() as db:
        rows = db.execute("SELECT * FROM plans WHERE status='active' ORDER BY created_at").fetchall()
    return [dict(r) for r in rows if plan_is_active(dict(r), date_str)]


def write_snapshots(plan_id: str, text: str, plan_type: str, plan_start: str) -> None:
    """Write plan as task snapshots into all existing daily_tasks rows
    with date >= plan_start."""
    with get_db() as db:
        rows = db.execute(
            "SELECT date, morning_tasks FROM daily_tasks WHERE date >= ?",
            (plan_start,),
        ).fetchall()
    for row in rows:
        tasks = json.loads(row["morning_tasks"] or "[]")
        # Avoid duplicate if snapshot already exists
        if any(t.get("planId") == plan_id for t in tasks):
            continue
        tasks.insert(0, {
            "id": _uid(),
            "text": text,
            "status": None,
            "eveningNote": "",
            "plan": plan_type,
            "planId": plan_id,
            "planStart": plan_start,
        })
        with get_db() as db:
            db.execute(
                "UPDATE daily_tasks SET morning_tasks=? WHERE date=?",
                (json.dumps(tasks, ensure_ascii=False), row["date"]),
            )


def archive_plan(plan_id: str) -> None:
    """Archive a plan — sets status='archived' and plan_end=today."""
    with get_db() as db:
        db.execute(
            "UPDATE plans SET status='archived', plan_end=? WHERE id=?",
            (today_str(), plan_id),
        )
