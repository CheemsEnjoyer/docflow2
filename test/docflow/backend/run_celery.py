#!/usr/bin/env python3
import sys
import platform
from app.core.celery_app import celery_app
from app.core.config import settings


def main():
    print("=" * 50)
    print("  DocFlow Celery Worker")
    print("=" * 50)
    print(f"  Broker: {settings.CELERY_BROKER_URL}")
    print(f"  Backend: {settings.CELERY_RESULT_BACKEND}")
    print("=" * 50)
    print()

    # On Windows, use threads to allow true concurrent task execution.
    # 'solo' always runs one task at a time regardless of concurrency.
    pool = "threads" if platform.system() == "Windows" else "prefork"

    argv = [
        "worker",
        "--loglevel=info",
        f"--pool={pool}",
        "--concurrency=2",  # Run up to two tasks concurrently
    ]

    celery_app.worker_main(argv)


if __name__ == "__main__":
    main()
