"""
Celery tasks for folder trigger scanning.
"""
from app.core.celery_app import celery_app


@celery_app.task(name="scan_folder_triggers")
def scan_folder_triggers_task():
    """Periodic task: scan all enabled folder triggers for new files."""
    from app.services.folder_trigger_service import scan_folder_triggers
    scan_folder_triggers()
