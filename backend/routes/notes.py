"""Routes: /api/diary + /api/folders + /api/notes — diary, folder tree, notes CRUD."""

import json
import time
import uuid
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


# ── Folders ────────────────────────────────────────────────

@router.get("/folders/tree")
def get_folder_tree():
    """Get the full recursive folder tree with notes under each folder."""
    with get_db() as db:
        folders = db.execute(
            "SELECT * FROM note_folders ORDER BY sort_order, name"
        ).fetchall()
        # Build tree structure
        folder_map = {}
        tree = []
        for f in folders:
            folder_map[f["id"]] = {
                "id": f["id"],
                "name": f["name"],
                "parentId": f["parent_id"],
                "sortOrder": f["sort_order"],
                "children": [],
                "notes": [],
            }
        # Load notes into their folders + orphan notes
        orphan_notes = []
        notes = db.execute(
            "SELECT id, folder_id, title, updated_at FROM notes ORDER BY updated_at DESC"
        ).fetchall()
        for n in notes:
            if n["folder_id"] and n["folder_id"] in folder_map:
                folder_map[n["folder_id"]]["notes"].append({
                    "id": n["id"],
                    "title": n["title"] or "（无标题）",
                    "updatedAt": n["updated_at"],
                })
            else:
                orphan_notes.append({
                    "id": n["id"],
                    "title": n["title"] or "（无标题）",
                    "updatedAt": n["updated_at"],
                    "folderId": n["folder_id"],
                })
        # Build tree from map
        for f in folders:
            node = folder_map[f["id"]]
            if f["parent_id"] and f["parent_id"] in folder_map:
                folder_map[f["parent_id"]]["children"].append(node)
            else:
                tree.append(node)
        # Sort children by sort_order, then name
        def sort_children(node):
            node["children"].sort(key=lambda x: (x["sortOrder"], x["name"]))
            for child in node["children"]:
                sort_children(child)
        for node in tree:
            sort_children(node)
    return {"tree": tree, "orphanNotes": orphan_notes}


@router.post("/folders")
def create_folder(body: dict):
    """Create a new folder."""
    fid = body.get("id") or uuid.uuid4().hex[:12]
    name = body.get("name", "").strip()
    parent_id = body.get("parentId") or None
    sort_order = body.get("sortOrder", 0)
    now = time.time()
    with get_db() as db:
        db.execute(
            "INSERT INTO note_folders (id, name, parent_id, sort_order, created_at) VALUES (?,?,?,?,?)",
            (fid, name, parent_id, sort_order, now),
        )
    return {"ok": True, "id": fid}


@router.put("/folders/{folder_id}")
def update_folder(folder_id: str, body: dict):
    """Update a folder (rename, move, reorder)."""
    name = body.get("name")
    parent_id = body.get("parentId")
    sort_order = body.get("sortOrder")
    with get_db() as db:
        existing = db.execute("SELECT id FROM note_folders WHERE id=?", (folder_id,)).fetchone()
        if not existing:
            return {"error": "not found"}
        if name is not None:
            db.execute("UPDATE note_folders SET name=? WHERE id=?", (name.strip(), folder_id))
        if parent_id is not None:
            # prevent circular reference: can't set parent to self or descendant
            if parent_id == folder_id:
                return {"error": "cannot set parent to itself"}
            if parent_id:
                # check not a descendant
                descendant_ids = _get_descendant_ids(db, folder_id)
                if parent_id in descendant_ids:
                    return {"error": "cannot move folder into its own descendant"}
            db.execute("UPDATE note_folders SET parent_id=? WHERE id=?", (parent_id or None, folder_id))
        if sort_order is not None:
            db.execute("UPDATE note_folders SET sort_order=? WHERE id=?", (sort_order, folder_id))
    return {"ok": True}


@router.delete("/folders/{folder_id}")
def delete_folder(folder_id: str):
    """Delete a folder. All sub-folders and notes inside are also deleted or reassigned."""
    with get_db() as db:
        # Collect all descendant folder ids
        ids = _get_descendant_ids(db, folder_id)
        ids.append(folder_id)
        # Unlink notes from these folders (set folder_id to NULL)
        for fid in ids:
            db.execute("UPDATE notes SET folder_id=NULL WHERE folder_id=?", (fid,))
        # Delete all child folders first, then the target
        for fid in ids:
            db.execute("DELETE FROM note_folders WHERE id=?", (fid,))
    return {"ok": True}


# ── Notes ─────────────────────────────────────────────────

@router.post("/notes")
def create_note(body: dict):
    """Create a new note."""
    nid = body.get("id") or uuid.uuid4().hex[:12]
    folder_id = body.get("folderId") or None
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
            "INSERT INTO notes (id, folder_id, title, content, tags, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (nid, folder_id, title, content, json.dumps(tags, ensure_ascii=False), now, now),
        )
    return {"ok": True, "id": nid}


@router.get("/notes")
def list_notes(
    q: str = Query("", alias="q"),
    folder_id: str = Query(None, alias="folderId"),
):
    """List notes, optionally filtered by folder or search keyword."""
    with get_db() as db:
        where = " WHERE 1=1"
        params = []
        if folder_id:
            where += " AND folder_id=?"
            params.append(folder_id)
        if q:
            like = f"%{q}%"
            where += " AND (title LIKE ? OR content LIKE ?)"
            params.extend([like, like])
        rows = db.execute(
            f"SELECT * FROM notes{where} ORDER BY updated_at DESC",
            params,
        ).fetchall()
    return {
        "notes": [
            {
                "id": r["id"],
                "folderId": r["folder_id"],
                "title": r["title"],
                "content": r["content"],
                "tags": json.loads(r["tags"]) if r["tags"] else [],
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
            }
            for r in rows
        ]
    }


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
        "folderId": row["folder_id"],
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
    folder_id = body.get("folderId")
    tags = body.get("tags", [])
    if isinstance(tags, str):
        try:
            tags = json.loads(tags)
        except Exception:
            tags = [t.strip() for t in tags.split(",") if t.strip()]
    now = time.time()
    with get_db() as db:
        existing = db.execute("SELECT id FROM notes WHERE id=?", (note_id,)).fetchone()
        if not existing:
            return {"error": "not found"}
        db.execute(
            "UPDATE notes SET title=?, content=?, folder_id=?, tags=?, updated_at=? WHERE id=?",
            (title, content, folder_id, json.dumps(tags, ensure_ascii=False), now, note_id),
        )
    return {"ok": True}


@router.delete("/notes/{note_id}")
def delete_note(note_id: str):
    """Delete a note."""
    with get_db() as db:
        db.execute("DELETE FROM notes WHERE id=?", (note_id,))
    return {"ok": True}


# ── Helpers ───────────────────────────────────────────────

def _is_valid_date(s: str) -> bool:
    try:
        date_cls.fromisoformat(s)
        return True
    except Exception:
        return False


def _get_descendant_ids(db, folder_id: str) -> list:
    """Recursively collect all descendant folder ids."""
    result = []
    children = db.execute(
        "SELECT id FROM note_folders WHERE parent_id=?", (folder_id,)
    ).fetchall()
    for child in children:
        result.append(child["id"])
        result.extend(_get_descendant_ids(db, child["id"]))
    return result
