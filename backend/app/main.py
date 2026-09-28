from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    analyses,
    charts,
    dashboards,
    datasets,
    projects,
    queries,
    sources,
    superset_dashboards,
)
from app.auth import routes as auth_routes
from app.core.config import settings
from app.superset.client import superset_client

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    try:
        await superset_client.login()
    except Exception as exc:
        logger.warning("Superset indisponível no startup: %s", exc)
    yield
    await superset_client.close()


app = FastAPI(
    title="Saude360 - API",
    description="API principal da plataforma Saude360 - Inteligência e análise de dados do SUS",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth_routes.router, prefix=settings.api_prefix)
app.include_router(analyses.router, prefix=settings.api_prefix)
app.include_router(dashboards.router, prefix=settings.api_prefix)
app.include_router(projects.router, prefix=settings.api_prefix)
app.include_router(superset_dashboards.router, prefix=settings.api_prefix)
app.include_router(charts.router, prefix=settings.api_prefix)
app.include_router(datasets.router, prefix=settings.api_prefix)
app.include_router(queries.router, prefix=settings.api_prefix)
app.include_router(sources.router, prefix=settings.api_prefix)


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "MoniSUS API", "docs": "/docs"}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/superset")
async def health_superset() -> dict[str, str]:
    healthy = await superset_client.check_health()
    if healthy:
        return {"status": "ok", "superset": "connected"}
    return {"status": "degraded", "superset": "unavailable"}
