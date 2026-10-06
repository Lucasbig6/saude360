"""Ligação entre um projeto e uma fonte de dados.

As fontes de dados vivem no Superset (``/api/sources`` é um proxy da API de
databases de lá) e usam id inteiro, sem FK no Postgres do MoniSUS. Esta tabela
é o índice local que permite escopar fontes a um projeto sem tocar no Superset.

A exclusão do projeto apaga a ligação (a fonte continua existindo no Superset).
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.db.base import Base


class ProjectSource(Base):
    __tablename__ = "project_sources"
    __table_args__ = (
        UniqueConstraint("project_id", "source_id", name="uq_project_sources_project_source"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("projects.id", ondelete="CASCADE"),
        index=True,
    )
    # id do database no Superset (inteiro, sem FK).
    source_id: Mapped[int] = mapped_column(Integer, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
