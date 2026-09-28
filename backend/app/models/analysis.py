from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.db.base import Base


class Analysis(Base):
    """Uma análise salva pelo usuário.

    ``database_id`` e ``dataset_id`` são referências conceituais a objetos do
    Superset (inteiros internos do Superset) — não há FK para o banco do
    Superset.
    """

    __tablename__ = "analyses"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    sql: Mapped[str | None] = mapped_column(Text)
    database_id: Mapped[int | None] = mapped_column(Integer)
    db_schema: Mapped[str | None] = mapped_column(String(255))
    dataset_id: Mapped[int | None] = mapped_column(Integer)
    chart_type: Mapped[str | None] = mapped_column(String(100))
    dimension: Mapped[str | None] = mapped_column(String(255))
    metric: Mapped[str | None] = mapped_column(String(255))
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
