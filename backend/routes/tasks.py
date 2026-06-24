"""Routes: /api/tasks — daily task CRUD + Ebbinghaus reviews with SM-2 dynamic intervals."""

import json
import logging
import math
import time
from datetime import date as date_cls, timedelta

from fastapi import APIRouter, HTTPException, Query
from backend.db import get_db
from backend.models import SaveDayPayload, TaskItem, ReviewItem, ReviewCreate
from backend.services.plan_service import get_active_plans, _uid

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

# ── SM-2 Spaced Repetition Algorithm ──

def _sm2_calc(quality: int, ease_factor: float, repetitions: int, interval: int):
    """SM-2 algorithm: calculate new ease_factor, repetitions, interval.
    
    quality: 0-5 (0=complete blackout, 5=perfect recall)
    Returns: (new_ease_factor, new_repetitions, new_interval)
    """
    if quality < 3:
        # Forgot → reset
        repetitions = 0
        interval = 1
    else:
        if repetitions == 0:
            interval = 1
        elif repetitions == 1:
            interval = 6
        else:
            interval = round(interval * ease_factor)
        repetitions += 1
    
    ease_factor = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    ease_factor = max(1.3, ease_factor)
    
    return ease_factor, repetitions, interval


def _now_ts() -> float:
    return time.time()


def _row_to_day(row, date_str=None) -> dict:
    tasks = json.loads(row["morning_tasks"] or "[]")
    if date_str:
        tasks = _inject_reviews(tasks, date_str)
    return {
        "date": row["date"],
        "morningTasks": tasks,
        "morningNote": row["morning_note"] or "",
        "eveningNote": row["evening_note"] or "",
        "savedMorning": bool(row["saved_morning"]),
        "savedEvening": bool(row["saved_evening"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _inject_reviews(tasks: list, date_str: str) -> list:
    """Inject due reviews as non-deletable review tasks."""
    try:
        with get_db() as db:
            rows = db.execute(
                "SELECT * FROM reviews WHERE status='active' AND next_review=?",
                (date_str,),
            ).fetchall()
        for row in rows:
            src = row["source_url"] if "source_url" in row.keys() else None
            note = row["evening_note"] if "evening_note" in row.keys() else None
            tasks.insert(0, {
                "id": "_review_" + row["id"],
                "text": "复习：" + row["task_text"],
                "kind": "task",
                "status": None,
                "eveningNote": note or "",
                "plan": None,
                "itemType": "review",
                "reviewId": row["id"],
                "_readonly": True,
                "_reviewRound": row["review_round"],
                "sourceUrl": src if src else None,
            })
    except Exception:
        logging.exception("_inject_reviews failed for date %s", date_str)
    return tasks


def _auto_create_reviews(date_str: str, tasks: list):
    """After save_day: create review for newly done knowledge tasks."""
    for t in tasks:
        itype = getattr(t, 'itemType', None)
        status = getattr(t, 'status', None)
        review_id = getattr(t, 'reviewId', None)
        if itype == 'knowledge' and status == 'done' and not review_id:
            rid = _uid()
            start = (date_cls.today() + timedelta(days=1)).isoformat()
            now = _now_ts()
            source_url = getattr(t, 'sourceUrl', None) or ''
            evening_note = getattr(t, 'eveningNote', None) or ''
            with get_db() as db:
                db.execute(
                    """INSERT INTO reviews (id, task_text, review_round,
                       next_review, last_review, status, source_url, evening_note, created_at, updated_at)
                       VALUES (?, ?, 0, ?, NULL, 'active', ?, ?, ?, ?)""",
                    (rid, getattr(t, 'text', ''), start, source_url, evening_note, now, now),
                )
            try:
                if hasattr(t, 'reviewId'):
                    t.reviewId = rid
                elif isinstance(t, dict):
                    t["reviewId"] = rid
            except Exception:
                logging.exception("Failed to set reviewId on task in _auto_create_reviews")


@router.get("")
def list_days():
    """Return all saved days (only those with savedMorning=True)."""
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM daily_tasks WHERE saved_morning=1 ORDER BY date DESC"
        ).fetchall()
    return {"days": [_row_to_day(r) for r in rows]}


# ─── Review endpoints (Ebbinghaus) ───

@router.post("/review")
def create_review(body: ReviewCreate):
    """Manually create a review record."""
    from backend.services.plan_service import _uid
    rid = _uid()
    start = body.start_date or (date_cls.today() + timedelta(days=1)).isoformat()
    now = _now_ts()
    with get_db() as db:
        db.execute(
            """INSERT INTO reviews (id, task_text, review_round,
               next_review, last_review, status, source_url, evening_note, created_at, updated_at)
               VALUES (?, ?, 0, ?, NULL, 'active', ?, ?, ?, ?)""",
            (rid, body.task_text, start, body.source_url or '', body.evening_note or '', now, now),
        )
    return {"ok": True, "reviewId": rid, "nextReview": start}


@router.get("/reviews/due")
def get_due_reviews(date_str: str | None = None):
    """List reviews due on or before the given date (default: today)."""
    d = date_str or date_cls.today().isoformat()
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM reviews WHERE status='active' AND next_review<=? ORDER BY next_review",
            (d,),
        ).fetchall()
    return {"reviews": [_row_to_review(r) for r in rows]}


@router.post("/review/{review_id}/done")
def mark_review_done(review_id: str, quality: int = Query(5, ge=0, le=5)):
    """Mark a review as done; schedule next round or graduate using SM-2 algorithm.
    
    quality: 5=完美记得, 3=勉强记得, 1=忘了
    """
    now_dt = date_cls.today()
    today_str = now_dt.isoformat()
    with get_db() as db:
        row = db.execute("SELECT * FROM reviews WHERE id=?", (review_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Review not found")

        # ① 防止提前复习：今天还没到 scheduled 日期
        scheduled = date_cls.fromisoformat(row["next_review"])
        if now_dt < scheduled:
            raise HTTPException(status_code=400, detail=f"未到复习日期（计划日期：{row['next_review']}）")

        # ② 防止同一天重复点击：last_review 已是今天
        if row["last_review"] and row["last_review"] == today_str:
            raise HTTPException(status_code=400, detail="今天已复习过，无需重复操作")

        rnd = row["review_round"] + 1
        # Read SM-2 fields (graceful fallback for old rows)
        ef = row["ease_factor"] if "ease_factor" in row.keys() and row["ease_factor"] is not None else 2.5
        reps = row["repetitions"] if "repetitions" in row.keys() and row["repetitions"] is not None else 0
        ivl = row["interval"] if "interval" in row.keys() and row["interval"] is not None else 1
        
        # 6 rounds max → graduate
        if rnd >= 6:
            db.execute("UPDATE reviews SET status='graduated', review_round=?, updated_at=? WHERE id=?",
                      (rnd, _now_ts(), review_id))
            return {"ok": True, "status": "graduated", "round": rnd}
        
        # SM-2 calculation
        ef, reps, ivl = _sm2_calc(quality, ef, reps, ivl)
        next_d = (now_dt + timedelta(days=ivl)).isoformat()
        db.execute(
            """UPDATE reviews SET review_round=?, last_review=?, next_review=?,
               ease_factor=?, repetitions=?, interval=?, updated_at=? WHERE id=?""",
            (rnd, today_str, next_d, round(ef, 4), reps, ivl, _now_ts(), review_id),
        )
    return {"ok": True, "nextReview": next_d, "round": rnd, "interval": ivl}


@router.delete("/review/{review_id}")
def delete_review(review_id: str):
    """Delete (graduate) a review."""
    with get_db() as db:
        db.execute("UPDATE reviews SET status='deleted', updated_at=? WHERE id=?",
                  (_now_ts(), review_id))
    return {"ok": True}


def _row_to_review(row) -> dict:
    result = {
        "id": row["id"],
        "taskText": row["task_text"],
        "reviewRound": row["review_round"],
        "nextReview": row["next_review"],
        "lastReview": row["last_review"],
        "status": row["status"],
        "sourceUrl": row["source_url"] if "source_url" in row.keys() and row["source_url"] else None,
        "eveningNote": row["evening_note"] if "evening_note" in row.keys() and row["evening_note"] else None,
    }
    # SM-2 fields (graceful fallback for old rows)
    result["easeFactor"] = row["ease_factor"] if "ease_factor" in row.keys() and row["ease_factor"] is not None else 2.5
    result["repetitions"] = row["repetitions"] if "repetitions" in row.keys() and row["repetitions"] is not None else 0
    result["interval"] = row["interval"] if "interval" in row.keys() and row["interval"] is not None else 1
    return result


@router.get("/reviews/overview")
def get_reviews_overview():
    """Knowledge overview: all reviews grouped by learning stage."""
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM reviews WHERE status IN ('active','graduated') ORDER BY next_review ASC"
        ).fetchall()
    
    reviews = [_row_to_review(r) for r in rows]
    
    # Group by stage
    learning = [r for r in reviews if r["status"] == "active" and r["reviewRound"] <= 1]
    reviewing = [r for r in reviews if r["status"] == "active" and r["reviewRound"] >= 2]
    graduated = [r for r in reviews if r["status"] == "graduated"]
    
    return {
        "learning": learning,
        "reviewing": reviewing,
        "graduated": graduated,
        "stats": {
            "total": len(reviews),
            "learning": len(learning),
            "reviewing": len(reviewing),
            "graduated": len(graduated),
            "dueToday": len([r for r in reviews if r["status"] == "active" and r["nextReview"] <= date_cls.today().isoformat()]),
        },
    }


@router.get("/{date_str}")
def get_day(date_str: str):
    """Get a single day's data. Inject due reviews."""
    with get_db() as db:
        row = db.execute(
            "SELECT * FROM daily_tasks WHERE date=?", (date_str,)
        ).fetchone()

    if row:
        return _row_to_day(row, date_str)

    # Not in DB — build skeleton with active plan snapshots
    plans = get_active_plans(date_str)
    tasks = [{"id": _uid(), "text": "", "kind": "task",
               "status": None, "eveningNote": "", "plan": None}]
    for p in plans:
        tasks.insert(0, {
            "id": _uid(), "text": p["text"], "kind": "habit",
            "status": None, "eveningNote": "",
            "plan": p["plan_type"], "planId": p["id"], "planStart": p.get("plan_start"),
        })
    tasks = _inject_reviews(tasks, date_str)
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
    """Save (upsert) a day's data. Filter out injected review tasks."""
    # Remove read-only injected review tasks before saving
    clean_tasks = [
        t for t in payload.morningTasks
        if getattr(t, 'itemType', None) != 'review'
        and not str(getattr(t, 'id', '')).startswith('_review_')
    ]
    # Detect newly done knowledge tasks → create reviews
    _auto_create_reviews(date_str, payload.morningTasks)

    tasks_json = json.dumps(
        [t.model_dump(exclude_none=True) for t in clean_tasks],
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
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (date_str, tasks_json, payload.morningNote, payload.eveningNote,
                 int(payload.savedMorning), int(payload.savedEvening),
                 now_ts, now_ts),
            )
    return {"ok": True, "date": date_str}


