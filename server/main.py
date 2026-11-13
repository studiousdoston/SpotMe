"""SpotMe API entry point.
All routes live under /api so that, in production, Nginx can forward
/api to this app and serve the web build for everything else.
"""

from fastapi import APIRouter, FastAPI

app = FastAPI(title="SpotMe API")

api_router = APIRouter(prefix="/api")


@api_router.get("/health")
def get_health() -> dict[str, str]:
    return {"status": "ok"}


# Mount the /api router on the app.
app.include_router(api_router)
