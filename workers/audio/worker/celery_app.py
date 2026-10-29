import os

from celery import Celery

broker = os.getenv("CELERY_BROKER_URL", "redis://127.0.0.1:6379/0")
backend = os.getenv("CELERY_RESULT_BACKEND", "redis://127.0.0.1:6379/1")

celery_app = Celery("estudio_audio", broker=broker, backend=backend)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
)

celery_app.autodiscover_tasks(["worker.tasks"])


@celery_app.task(name="worker.ping")
def ping() -> dict:
    return {"ok": True, "adapter": os.getenv("SEPARATION_ADAPTER", "contract")}
