"""Routes: /api/diary + /api/notes — diary and notes CRUD."""

import json
import time
from datetime import date as date_cls

from fastapi import APIRouter, Query
from backend.db import get_db

router = APIRouter(prefix="/api", tags=["notes"])


# ── Diary ──────────────────────────────────────────────────

@router.get("/diary/{date_str}")
def get_diary(date_str: str):
    """Get diary entry for a date."""
    if not _is_valid_date(date_str):
        return {"error": "invalid date format, use YYYY-MM-DD"}
    with get_db() as db:
        row = db.execute(
            "SELECT * FROM diary WHERE date=?", (date_str,)
        ).fetchone()
    if not row:
        return {"date": date_str, "content": "", "exists": False}
    return {
        "date": row["date"],
        "content": row["content"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "exists": True,
    }


@router.post("/diary/{date_str}")
def save_diary(date_str: str, body: dict):
    """Save or update diary entry for a date."""
    if not _is_valid_date(date_str):
        return {"error": "invalid date format, use YYYY-MM-DD"}
    content = body.get("content", "")
    now = time.time()
    with get_db() as db:
        existing = db.execute(
            "SELECT date FROM diary WHERE date=?", (date_str,)
        ).fetchone()
        if existing:
            db.execute(
                "UPDATE diary SET content=?, updated_at=? WHERE date=?",
                (content, now, date_str),
            )
        else:
            db.execute(
                "INSERT INTO diary (date, content, created_at, updated_at) VALUES (?,?,?,?)",
                (date_str, content, now, now),
            )
    return {"ok": True, "date": date_str}


@router.delete("/diary/{date_str}")
def delete_diary(date_str: str):
    """Delete diary entry for a date."""
    if not _is_valid_date(date_str):
        return {"error": "invalid date format"}
    with get_db() as db:
        db.execute("DELETE FROM diary WHERE date=?", (date_str,))
    return {"ok": True}


# ── Notes ─────────────────────────────────────────────────

@router.post("/notes")
def create_note(body: dict):
    """Create a new note."""
    import uuid
    nid = body.get("id") or uuid.uuid4().hex[:12]
    title = body.get("title", "").strip()
    content = body.get("content", "")
    tags = body.get("tags", [])
    if isinstance(tags, str):
        try:
            tags = json.loads(tags)
        except Exception:
            tags = [t.strip() for t in tags.split(",") if t.strip()]
    now = time.time()
    with get_db() as db:
        db.execute(
            "INSERT INTO notes (id, title, content, tags, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?)",
            (nid, title, content, json.dumps(tags, ensure_ascii=False), now, now),
        )
    return {"ok": True, "id": nid}


@router.get("/notes")
def list_notes(q: str = Query("", alias="q")):
    """List all notes, optionally filtered by search keyword."""
    with get_db() as db:
        if q:
            like = f"%{q}%"
            rows = db.execute(
                "SELECT * FROM notes WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC",
                (like, like),
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM notes ORDER BY updated_at DESC"
            ).fetchall()
    return {
        "notes": [
            {
                "id": r["id"],
                "title": r["title"],
                "content": r["content"],
                "tags": json.loads(r["tags"]) if r["tags"] else [],
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
            }
            for r in rows
        ]
    }


@router.get("/notes/{note_id}")
def get_note(note_id: str):
    """Get a single note by id."""
    with get_db() as db:
        row = db.execute(
            "SELECT * FROM notes WHERE id=?", (note_id,)
        ).fetchone()
    if not row:
        return {"error": "not found"}
    return {
        "id": row["id"],
        "title": row["title"],
        "content": row["content"],
        "tags": json.loads(row["tags"]) if row["tags"] else [],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


@router.put("/notes/{note_id}")
def update_note(note_id: str, body: dict):
    """Update a note."""
    title = body.get("title", "").strip()
    content = body.get("content", "")
    tags = body.get("tags", [])
    if isinstance(tags, str):
        try:
            tags = json.loads(tags)
        except Exception:
            tags = [t.strip() for t in tags.split(",") if t.strip()]
    now = time.time()
    with get_db() as db:
        db.execute(
            "UPDATE notes SET title=?, content=?, tags=?, updated_at=? WHERE id=?",
            (title, content, json.dumps(tags, ensure_ascii=False), now, note_id),
        )
    return {"ok": True}


@router.delete("/notes/{note_id}")
def delete_note(note_id: str):
    """Delete a note."""
    with get_db() as db:
        db.execute("DELETE FROM notes WHERE id=?", (note_id,))
    return {"ok": True}


@router.get("/notes/search")
def search_notes(q: str = Query(..., min_length=1)):
    """Full-text search across diary and notes."""
    like = f"%{q}%"
    with get_db() as db:
        diary_rows = db.execute(
            "SELECT date, content, updated_at FROM diary "
            "WHERE content LIKE ? ORDER BY date DESC",
            (like,),
        ).fetchall()
        note_rows = db.execute(
            "SELECT * FROM notes WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC",
            (like, like),
        ).fetchall()
    return {
        "diary": [
            {
                "date": r["date"],
                "content": r["content"][:200],
                "updated_at": r["updated_at"],
            }
            for r in diary_rows
        ],
        "notes": [
            {
                "id": r["id"],
                "title": r["title"],
                "content": r["content"][:200],
                "tags": json.loads(r["tags"]) if r["tags"] else [],
                "updated_at": r["updated_at"],
            }
            for r in note_rows
        ],
    }


# ── Helpers ───────────────────────────────────────────────

def _is_valid_date(s: str) -> bool:
    try:
        date_cls.fromisoformat(s)
        return True
    except Exception:
        return False
