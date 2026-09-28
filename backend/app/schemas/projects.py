from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base dos payloads públicos: JSON em camelCase (tipos do frontend)."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class ProjectCreate(CamelModel):
    name: Annotated[str, Field(min_length=1, max_length=255)]
    description: str | None = None


class ProjectUpdate(CamelModel):
    """PUT: só os campos presentes no payload são aplicados."""

    name: Annotated[str | None, Field(min_length=1, max_length=255)] = None
    description: str | None = None


class ProjectResponse(CamelModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    analysis_count: int = 0
    chart_count: int = 0
    dashboard_count: int = 0
    created_by: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
