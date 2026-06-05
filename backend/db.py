"""Database connection and initialization."""

import sqlite3
import os
from pathlib import Path
from contextlib import contextmanager

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "daily_tasks.db"


@contextmanager
def get_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS daily_tasks (
                date            TEXT PRIMARY KEY,
                morning_tasks   TEXT DEFAULT '[]',
                morning_note    TEXT DEFAULT '',
                evening_note    TEXT DEFAULT '',
                saved_morning   INTEGER DEFAULT 0,
                saved_evening   INTEGER DEFAULT 0,
                created_at      REAL,
                updated_at      REAL
            );

            CREATE TABLE IF NOT EXISTS plans (
                id          TEXT PRIMARY KEY,
                text        TEXT NOT NULL,
                plan_type   TEXT NOT NULL,
                plan_start  TEXT,
                plan_end    TEXT,
                status      TEXT DEFAULT 'active',
                created_at  REAL
            );

            CREATE TABLE IF NOT EXISTS streaks (
                plan_id         TEXT PRIMARY KEY,
                current         INTEGER DEFAULT 0,
                best            INTEGER DEFAULT 0,
                last_done_date  TEXT,
                FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS focus_sessions (
                id          TEXT PRIMARY KEY,
                date        TEXT NOT NULL,
                task_id     TEXT,
                task_text   TEXT DEFAULT '',
                start_ts    REAL NOT NULL,
                end_ts      REAL,
                duration    INTEGER DEFAULT 0,
                note        TEXT DEFAULT ''
            );
        """)
        # Migration: add status column if missing
        try:
            db.execute("SELECT status FROM plans LIMIT 1")
        except sqlite3.OperationalError:
            db.execute("ALTER TABLE plans ADD COLUMN status TEXT DEFAULT 'active'")
