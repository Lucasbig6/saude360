from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.analysis import Analysis


class Dashboard(Base):
    __tablename__ = "dashboards"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    appearance: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'")
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("projects.id", ondelete="SET NULL"), index=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    widgets: Mapped[list[DashboardWidget]] = relationship(
        back_populates="dashboard",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="DashboardWidget.created_at",
        lazy="selectin",
    )
    filters: Mapped[list[DashboardFilter]] = relationship(
        back_populates="dashboard",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="DashboardFilter.created_at",
        lazy="selectin",
    )


class DashboardWidget(Base):
    __tablename__ = "dashboard_widgets"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    dashboard_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("dashboards.id", ondelete="CASCADE"), nullable=False
    )
    analysis_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False
    )
    position_x: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    position_y: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    width: Mapped[int] = mapped_column(
        Integer, nullable=False, default=4, server_default=text("4")
    )
    height: Mapped[int] = mapped_column(
        Integer, nullable=False, default=4, server_default=text("4")
    )
    widget: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    dashboard: Mapped[Dashboard] = relationship(back_populates="widgets")
    analysis: Mapped[Analysis] = relationship(
        "Analysis", foreign_keys=[analysis_id], lazy="selectin"
    )




class DashboardFilter(Base):
    __tablename__ = "dashboard_filters"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    dashboard_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("dashboards.id", ondelete="CASCADE"), nullable=False
    )
    dataset_id: Mapped[int | None] = mapped_column(Integer)
    column_name: Mapped[str] = mapped_column(String(255), nullable=False)
    operator: Mapped[str] = mapped_column(String(50), nullable=False)
    default_value: Mapped[str | None] = mapped_column(Text)
    scope: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    dashboard: Mapped[Dashboard] = relationship(back_populates="filters")
