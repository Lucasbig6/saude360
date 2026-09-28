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


class AnalysisCreate(CamelModel):
    name: Annotated[str, Field(min_length=1, max_length=255)]
    description: str | None = None
    sql: str | None = None
    database_id: int | None = None
    db_schema: Annotated[str | None, Field(max_length=255)] = None
    dataset_id: int | None = None
    chart_type: Annotated[str | None, Field(max_length=100)] = None
    dimension: Annotated[str | None, Field(max_length=255)] = None
    metric: Annotated[str | None, Field(max_length=255)] = None
    project_id: uuid.UUID | None = None


class AnalysisUpdate(CamelModel):
    """PUT: só os campos presentes no payload são aplicados.

    ``project_id`` ausente não altera o vínculo; ``null`` remove do projeto.
    """

    name: Annotated[str, Field(min_length=1, max_length=255)] | None = None
    description: str | None = None
    sql: str | None = None
    database_id: int | None = None
    db_schema: Annotated[str | None, Field(max_length=255)] = None
    dataset_id: int | None = None
    chart_type: Annotated[str | None, Field(max_length=100)] = None
    dimension: Annotated[str | None, Field(max_length=255)] = None
    metric: Annotated[str | None, Field(max_length=255)] = None
    project_id: uuid.UUID | None = None


class AnalysisResponse(CamelModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    sql: str | None = None
    database_id: int | None = None
    db_schema: str | None = None
    dataset_id: int | None = None
    chart_type: str | None = None
    dimension: str | None = None
    metric: str | None = None
    project_id: uuid.UUID | None = None
    created_by: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
