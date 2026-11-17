"""SpotMe API entry point.
All routes live under /api so that, in production, Nginx can forward
/api to this app and serve the web build for everything else.
"""

import os

from fastapi import APIRouter, FastAPI

from routers import analyze

# SPOTME_ENV=production (set by deploy/systemd/spotme-api.service) turns off the interactive docs
# (/docs, /redoc, /openapi.json) so the public server doesn't advertise its API. Anything else
# (unset locally) counts as development, where the docs stay on.
# Auto-reload is a uvicorn command-line flag: only the local dev command uses --reload.
IS_PRODUCTION = os.environ.get("SPOTME_ENV", "development") == "production"

app = FastAPI(
    title="SpotMe API",
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)

api_router = APIRouter(prefix="/api")


@api_router.get("/health")
def get_health() -> dict[str, str]:
    return {"status": "ok"}


# Feature routers, all under /api.
api_router.include_router(analyze.router)

# Mount the /api router on the app.
app.include_router(api_router)
