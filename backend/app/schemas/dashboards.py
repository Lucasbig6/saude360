from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

from app.schemas.analyses import CamelModel

CHART_TYPES = frozenset(
    {
        "bar",
        "line",
        "area",
        "pie",
        "donut",
        "scatter",
        "radar",
        "gauge",
        "funnel",
        "heatmap",
        "treemap",
    }
)


def encode_filter_value(value: Any) -> Any:
    """`string | string[]` -> TEXT (arrays viram JSON string)."""
    if isinstance(value, list):
        return json.dumps(value, ensure_ascii=False)
    return value


def decode_filter_value(value: Any) -> Any:
    """TEXT -> `string | string[]` (JSON array volta a ser array)."""
    if isinstance(value, str) and value.startswith("["):
        try:
            parsed = json.loads(value)
        except (ValueError, TypeError):
            return value
        if isinstance(parsed, list):
            return parsed
    return value


class LayoutIn(CamelModel):
    x: int = 0
    y: int = 0
    w: int = 4
    h: int = 4


class WidgetConfigModel(CamelModel):
    """Base da config v2 do widget: campos extras são preservados.

    O frontend evolui os formatos (F3+) antes do backend — validar só o que
    é estrutural evita quebrar payloads futuros.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        extra="allow",
    )


class EncodingIn(WidgetConfigModel):
    x: str | None = None
    y: str | None = None
    color: str | None = None
    size: str | None = None
    series: str | None = None


class AggregationIn(WidgetConfigModel):
    field: Annotated[str, Field(min_length=1)]
    function: Literal["sum", "avg", "count", "min", "max"]


class SortIn(WidgetConfigModel):
    field: Annotated[str, Field(min_length=1)]
    direction: Literal["asc", "desc"]


class ChartWidgetIn(WidgetConfigModel):
    type: Literal[
        "bar",
        "line",
        "area",
        "pie",
        "donut",
        "scatter",
        "radar",
        "gauge",
        "funnel",
        "heatmap",
        "treemap",
    ]
    encoding: EncodingIn | None = None
    aggregation: AggregationIn | None = None
    sort: SortIn | None = None
    limit: Annotated[int, Field(ge=1)] | None = None
    legend: bool | None = None
    tooltip: bool | None = None
    title: str | None = None
    options: dict[str, Any] | None = None


class StaticWidgetIn(WidgetConfigModel):
    """table/kpi/text/image: forma livre por enquanto (validação no F3)."""

    type: Literal["table", "kpi", "text", "image"]


WidgetConfigIn = Annotated[
    ChartWidgetIn | StaticWidgetIn, Field(discriminator="type")
]


class WidgetIn(CamelModel):
    id: uuid.UUID | None = None
    analysis_id: uuid.UUID
    layout: LayoutIn = Field(default_factory=LayoutIn)
    widget: WidgetConfigIn | None = None


class LayoutOut(CamelModel):
    x: int
    y: int
    w: int
    h: int


class WidgetOut(CamelModel):
    id: uuid.UUID
    analysis_id: uuid.UUID
    layout: LayoutOut
    widget: dict[str, Any] = Field(default_factory=dict)


class FilterIn(CamelModel):
    id: uuid.UUID | None = None
    dataset_id: int | None = None
    column: Annotated[str, Field(min_length=1, max_length=255)]
    operator: Annotated[str, Field(min_length=1, max_length=50)]
    default_value: str | list[str] | None = None
    scope: str | list[str] | None = None

    @field_validator("default_value", "scope", mode="before")
    @classmethod
    def _encode(cls, value: Any) -> Any:
        return encode_filter_value(value)


class FilterOut(CamelModel):
    id: uuid.UUID
    dataset_id: int | None = None
    column: str
    operator: str
    default_value: str | list[str] | None = None
    scope: str | list[str] | None = None

    @field_validator("default_value", "scope", mode="before")
    @classmethod
    def _decode(cls, value: Any) -> Any:
        return decode_filter_value(value)


class DashboardCreate(CamelModel):
    name: Annotated[str, Field(min_length=1, max_length=255)]
    description: str | None = None
    slug: Annotated[str | None, Field(max_length=255)] = None
    appearance: dict[str, Any] = Field(default_factory=dict)
    widgets: list[WidgetIn] = Field(default_factory=list)
    filters: list[FilterIn] = Field(default_factory=list)
    project_id: uuid.UUID | None = None


class DashboardUpdate(CamelModel):
    """PUT: campos ausentes mantêm o valor atual; listas vazias limpam.

    ``project_id`` ausente não altera o vínculo; ``null`` remove do projeto.
    """

    name: Annotated[str, Field(min_length=1, max_length=255)] | None = None
    description: str | None = None
    slug: Annotated[str | None, Field(max_length=255)] = None
    appearance: dict[str, Any] | None = None
    widgets: list[WidgetIn] | None = None
    filters: list[FilterIn] | None = None
    project_id: uuid.UUID | None = None


class DashboardResponse(CamelModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    slug: str
    appearance: dict[str, Any]
    widgets: list[WidgetOut] = Field(default_factory=list)
    filters: list[FilterOut] = Field(default_factory=list)
    project_id: uuid.UUID | None = None
    created_by: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
