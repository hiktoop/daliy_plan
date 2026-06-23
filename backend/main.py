"""FastAPI application entry point."""

from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.db import init_db, set_db_path
from backend.routes.tasks import router as tasks_router
from backend.routes.plans import router as plans_router
from backend.routes.stats import router as stats_router
from backend.routes.pomodoro import router as pomodoro_router
from backend.routes.habits import router as habits_router
from backend.routes.notes import router as notes_router

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"


def create_app(db_path: str = None):
    """Create a FastAPI application instance.

    Args:
        db_path: Optional database path. If None, uses the default path.
                 Pass ':memory:' for testing with an in-memory database.
    """
    if db_path is not None:
        set_db_path(db_path)

    init_db()

    _app = FastAPI(title="Daily Tasks API", version="2.0.0")

    _app.include_router(tasks_router)
    _app.include_router(plans_router)
    _app.include_router(stats_router)
    _app.include_router(pomodoro_router)
    _app.include_router(habits_router)
    _app.include_router(notes_router)

    @_app.get("/")
    async def root():
        return FileResponse(STATIC_DIR / "build" / "index.html")

    _app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    return _app


app = create_app()
