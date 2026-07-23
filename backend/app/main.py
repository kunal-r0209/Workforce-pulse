"""
FastAPI Application Entry Point
"""
import os
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-load and cache data on startup
    from .services.data_pipeline import load_and_process
    load_and_process()
    yield


app = FastAPI(
    title="Workforce Pulse API",
    description="Employee productivity analytics platform",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow all origins for development; restrict in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API routers (must be registered BEFORE static file catch-all) ──
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(ai_chat.router, prefix="/api/ai", tags=["AI"])
app.include_router(export_data.router, prefix="/api/export", tags=["Export"])


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/data-quality")
async def data_quality():
    from .services.data_pipeline import get_data
    data = get_data()
    return data["audit"]


# ── Serve built React frontend (production only) ──────────────────
# backend/static/ is created by build.sh; not present in local dev.
STATIC_DIR = Path(__file__).parent.parent / "static"

if STATIC_DIR.exists():
    # Serve Vite's hashed asset files (JS/CSS/images)
    _assets = STATIC_DIR / "assets"
    if _assets.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """
        Catch-all: return index.html for every non-API path so
        React Router can handle client-side navigation.
        """
        index = STATIC_DIR / "index.html"
        return FileResponse(str(index))
