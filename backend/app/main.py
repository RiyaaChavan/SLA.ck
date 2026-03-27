from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import settings
from app.db.schema import reconcile_sqlite_schema
from app.db.session import engine
from app.models.base import Base
from app.services.detector_runtime import start_detector_scheduler, stop_detector_scheduler
from app.utils.logging import configure_logging


configure_logging()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    reconcile_sqlite_schema(engine)
    start_detector_scheduler()
    try:
        yield
    finally:
        await stop_detector_scheduler()


app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.get("/")
def root() -> dict[str, str]:
    return {"message": f"{settings.app_name} backend is running"}
