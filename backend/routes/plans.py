"""Routes: /api/plans — plan CRUD + archive logic."""

import time

from fastapi import APIRouter
from backend.db import get_db
from backend.models import PlanItem
from backend.services.plan_service import (
    today_str, offset_date, _now_ts, archive_plan,
)

router = APIRouter(prefix="/api/plans", tags=["plans"])


@router.get("")
def list_plans():
    """Return all active plan definitions with streak info."""
    with get_db() as db:
        plans = db.execute(
            "SELECT * FROM plans WHERE status='active' ORDER BY created_at"
        ).fetchall()
        streaks = db.execute("SELECT * FROM streaks").fetchall()

    stre_map = {s["plan_id"]: dict(s) for s in streaks}
    result = []
    for p in plans:
        pd = dict(p)
        pd["streak"] = stre_map.get(pd["id"], {"current": 0, "best": 0, "lastDoneDate": None})
        result.append(pd)
    return {"plans": result}


@router.post("")
def create_plan(payload: PlanItem):
    """Create a new plan. Snapshots are injected dynamically when dates are loaded."""
    plan_start = payload.planStart or today_str()

    if payload.plan == "week":
        plan_end = offset_date(plan_start, 6)
    elif payload.plan == "month":
        plan_end = offset_date(plan_start, 29)
    else:
        plan_end = None  # long: indefinite

    with get_db() as db:
        db.execute(
            """INSERT OR REPLACE INTO plans (id, text, plan_type, plan_start, plan_end, status, created_at)
               VALUES (?,?,?,?,?,'active',?)""",
            (payload.id, payload.text, payload.plan, plan_start, plan_end, _now_ts()),
        )
        db.execute(
            "INSERT OR IGNORE INTO streaks (plan_id, current, best) VALUES (?,0,0)",
            (payload.id,),
        )

    return {"ok": True, "id": payload.id}


@router.put("/{plan_id}")
def update_plan(plan_id: str, payload: PlanItem):
    """Update a plan: archive old, create new."""
    archive_plan(plan_id)

    plan_start = payload.planStart or today_str()

    if payload.plan == "week":
        plan_end = offset_date(plan_start, 6)
    elif payload.plan == "month":
        plan_end = offset_date(plan_start, 29)
    else:
        plan_end = None

    with get_db() as db:
        db.execute(
            """INSERT OR REPLACE INTO plans (id, text, plan_type, plan_start, plan_end, status, created_at)
               VALUES (?,?,?,?,?,'active',?)""",
            (payload.id, payload.text, payload.plan, plan_start, plan_end, _now_ts()),
        )
        db.execute(
            "INSERT OR IGNORE INTO streaks (plan_id, current, best) VALUES (?,0,0)",
            (payload.id,),
        )

    return {"ok": True, "id": payload.id}


@router.delete("/{plan_id}")
def delete_plan(plan_id: str):
    """Archive a plan (soft-delete). Historical snapshots are preserved."""
    archive_plan(plan_id)
    return {"ok": True}
