from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_created_by, get_current_token
from app.db.session import get_db
from app.models import Analysis, Project
from app.schemas.analyses import AnalysisCreate, AnalysisResponse, AnalysisUpdate

router = APIRouter(prefix="/analyses", tags=["Analyses"])


def _get_analysis(db: Session, analysis_id: uuid.UUID) -> Analysis:
    analysis = db.get(Analysis, analysis_id)
    if analysis is None:
        raise HTTPException(status_code=404, detail="Análise não encontrada")
    return analysis


def _validate_project(db: Session, project_id: uuid.UUID | None) -> None:
    """Associação é erro de requisição (400), não 404."""
    if project_id is None:
        return
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=400, detail="Projeto não encontrado")


@router.get("", response_model=list[AnalysisResponse])
def list_analyses(
    project_id: uuid.UUID | None = Query(default=None, alias="projectId"),
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
) -> list[Analysis]:
    stmt = select(Analysis).order_by(Analysis.created_at.desc())
    if project_id is not None:
        # Projeto inexistente não casa nenhuma linha -> coleção vazia (não 404).
        stmt = stmt.where(Analysis.project_id == project_id)
    return list(db.scalars(stmt).all())


@router.get("/{analysis_id}", response_model=AnalysisResponse)
def get_analysis(
    analysis_id: uuid.UUID,
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
) -> Analysis:
    return _get_analysis(db, analysis_id)


@router.post("", status_code=201, response_model=AnalysisResponse)
def create_analysis(
    payload: AnalysisCreate,
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
    created_by: uuid.UUID | None = Depends(get_created_by),
) -> Analysis:
    _validate_project(db, payload.project_id)
    analysis = Analysis(**payload.model_dump(), created_by=created_by)
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    return analysis


@router.put("/{analysis_id}", response_model=AnalysisResponse)
def update_analysis(
    analysis_id: uuid.UUID,
    payload: AnalysisUpdate,
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
) -> Analysis:
    analysis = _get_analysis(db, analysis_id)
    data = payload.model_dump(exclude_unset=True)
    if "project_id" in data:
        # presente (UUID ou null) -> valida/aplica; ausente -> não altera o vínculo.
        _validate_project(db, data["project_id"])
    for field, value in data.items():
        setattr(analysis, field, value)
    db.commit()
    db.refresh(analysis)
    return analysis


@router.delete("/{analysis_id}", status_code=204)
def delete_analysis(
    analysis_id: uuid.UUID,
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
) -> None:
    analysis = _get_analysis(db, analysis_id)
    db.delete(analysis)
    db.commit()
