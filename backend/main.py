"""FastAPI application entry point."""

from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.db import init_db
from backend.routes.tasks import router as tasks_router
from backend.routes.plans import router as plans_router
from backend.routes.stats import router as stats_router

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

# Init DB on import
init_db()

# Create app
app = FastAPI(title="Daily Tasks API", version="2.0.0")

# Register API routers BEFORE static mount
app.include_router(tasks_router)
app.include_router(plans_router)
app.include_router(stats_router)


@app.get("/")
async def root():
    return FileResponse(STATIC_DIR / "index.html")


# Mount static files at /static
# /static/app.js → STATIC_DIR/app.js
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
