"""
Document Extraction API - Main Application

Все эндпоинты регистрируются через роутеры в app/api/routes/
"""
import sys
from pathlib import Path

# Add backend directory to path for direct execution
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine, Base
from app.api.routes import document_types, processing_runs, extraction, search, users, triggers, auth

# Create database tables on startup
Base.metadata.create_all(bind=engine)

# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    description="API для извлечения данных из документов с использованием PaddleOCR",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(document_types.router, prefix="/api")
app.include_router(processing_runs.router, prefix="/api")
app.include_router(extraction.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(triggers.router, prefix="/api")
app.include_router(auth.router, prefix="/api")


@app.get("/")
def root():
    """Root endpoint with API info"""
    return {
        "name": settings.APP_NAME,
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/health"
    }


@app.get("/api/health")
def health_check():
    """Health check endpoint"""
    from app.services.ocr_service import is_paddle_initialized
    return {
        "status": "ok",
        "message": "Document Extraction API is running",
        "api_configured": is_paddle_initialized()
    }
