from __future__ import annotations

import logging
import uuid

import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models import User

logger = logging.getLogger(__name__)


def validate_access_token(token: str) -> dict:
    """Validate a Superset-issued JWT locally (signature, expiry, type)."""
    try:
        return jwt.decode(
            token,
            settings.superset_secret_key,
            algorithms=["HS256"],
            options={"verify_exp": True},
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=401,
            detail="Token expirado",
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=401,
            detail="Token inválido",
        ) from exc


async def get_current_token(authorization: str = Header(...)) -> str:
    """Extract Bearer token from Authorization header and validate it locally."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Formato de autorização inválido",
        )
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Token de autorização vazio",
        )

    claims = validate_access_token(token)
    if claims.get("type") != "access":
        raise HTTPException(
            status_code=401,
            detail="Token de tipo inválido",
        )

    return token


def get_created_by(
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
) -> uuid.UUID | None:
    """Resolve `created_by` (melhor esforço) a partir do `sub` do JWT.

    Retorna ``None`` quando o usuário local correspondente não existe —
    a coluna é nullable e o registro ainda é criado.
    """
    claims = validate_access_token(token)
    username = claims.get("sub")
    if not isinstance(username, str) or not username:
        return None

    return db.scalar(
        select(User.id).where(User.username == username, User.is_active.is_(True))
    )


async def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(get_current_token),
) -> User | None:
    """Retorna o objeto User completo se autenticado."""
    claims = validate_access_token(token)
    username = claims.get("sub")
    if not isinstance(username, str) or not username:
        return None
    return db.scalar(
        select(User).where(User.username == username, User.is_active.is_(True))
    )
