"""Shared pytest fixtures for all backend tests."""

import pytest
import time
import tempfile
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.main import create_app
from backend.db import get_db, set_db_path


@pytest.fixture
def app():
    """Create a fresh FastAPI app with a temp-file SQLite per test.
    
    Uses a named temp file so that init_db() and subsequent route handlers
    share the same database file across multiple connections.
    The file is deleted after the test.
    """
    fd, tmp_path = tempfile.mkstemp(suffix=".db", prefix="test_daily_")
    os.close(fd)
    _app = create_app(db_path=tmp_path)
    yield _app
    try:
        os.unlink(tmp_path)
    except OSError:
        pass
    # Also clean up WAL/SHM files if any
    for suffix in ("-wal", "-shm"):
        try:
            os.unlink(tmp_path + suffix)
        except OSError:
            pass


@pytest.fixture
def client(app):
    """TestClient wrapping the app."""
    from fastapi.testclient import TestClient
    return TestClient(app)


@pytest.fixture
def db(app):
    """Raw sqlite3 connection for direct data setup or verification."""
    with get_db() as conn:
        yield conn


@pytest.fixture
def now_ts():
    """Current unix timestamp."""
    return time.time()


@pytest.fixture
def today_str(now_ts):
    """Today's date as ISO string."""
    return time.strftime("%Y-%m-%d", time.localtime(now_ts))


@pytest.fixture
def sample_task():
    """A sample morning task dict."""
    return {"id": "t001", "text": "Write tests", "kind": "task", "status": "todo"}


def _uid():
    import random
    return "".join(random.choices("abcdef0123456789", k=12))
