#!/usr/bin/env python3
"""
Document Extraction API - Entry Point

Запуск сервера:
    python run.py

Или с uvicorn напрямую:
    uvicorn app.main:app --host 0.0.0.0 --port 5000 --reload
"""
import uvicorn
from app.core.config import settings


def main():
    """Запуск FastAPI сервера"""
    print("=" * 50)
    print(f"  {settings.APP_NAME}")
    print("=" * 50)
    print(f"  Debug mode: {settings.DEBUG}")
    print(f"  Database: {settings.DATABASE_URL.split('@')[-1] if '@' in settings.DATABASE_URL else 'configured'}")
    print("=" * 50)
    print()
    print("  API Documentation: http://localhost:5000/docs")
    print("  Health check:      http://localhost:5000/api/health")
    print()

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=5000,
        reload=settings.DEBUG,
        log_level="info"
    )


if __name__ == "__main__":
    main()
