from fastapi import APIRouter

from app.api.v1 import (
    admin,
    audio_assets,
    auth,
    practice,
    processing,
    projects,
    studio,
    system,
    uploads,
    users,
    vocal,
    voicecheck,
    voicecheck_diagnoses,
    voicecheck_enhance,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(system.router)
api_router.include_router(users.router)
api_router.include_router(projects.router)
api_router.include_router(uploads.router)
api_router.include_router(audio_assets.router)
api_router.include_router(processing.router)
api_router.include_router(studio.router)
api_router.include_router(practice.router)
api_router.include_router(vocal.router)
api_router.include_router(voicecheck_diagnoses.router)
api_router.include_router(voicecheck_enhance.router)
api_router.include_router(voicecheck.router)
api_router.include_router(admin.router)
