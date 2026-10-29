from worker.celery_app import celery_app


@celery_app.task(name="worker.health.check")
def health_check() -> dict:
    return {"status": "ok"}
