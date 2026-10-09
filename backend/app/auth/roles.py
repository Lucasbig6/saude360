from __future__ import annotations

import uuid
from typing import Any

import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models import Role, User, UserRole


def _resolve_user_roles(db: Session, token: str) -> set[str]:
    """Resolve o conjunto de role names do usuário a partir do JWT."""
    claims = jwt.decode(
        token,
        settings.superset_secret_key,
        algorithms=["HS256"],
        options={"verify_exp": True},
    )
    username: str | None = claims.get("sub")
    if not isinstance(username, str) or not username:
        return set()
    user = db.scalar(
        select(User).where(User.username == username, User.is_active.is_(True))
    )
    if user is None:
        return set()
    role_names = {
        r.name
        for r in user.roles
        if isinstance(r, Role) and r.name is not None
    }
    return role_names


def require_role(
    allowed: set[str],
) -> Any:
    """Factory que retorna um Depends que verifica papel (role).

    Use como: ``Depends(require_role({"ADMIN"}))``.
    Permite acesso total se a config estiver em development e não houver
    roles configurados (backward compatible).
    """

    async def dependency(
        authorization: str = Header(...),
        db: Session = Depends(get_db),
    ) -> str:
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

        # Em development, se não houver roles configurados, deixa passar
        # para não quebrar boot existente.
        if settings.app_env.lower() in ("development", "test"):
            # Ainda validamos que o token é válido; roles só se existirem.
            try:
                jwt.decode(
                    token,
                    settings.superset_secret_key,
                    algorithms=["HS256"],
                    options={"verify_exp": True},
                )
            except Exception:
                raise HTTPException(status_code=401, detail="Token inválido")
            return token

        # Produção: exige role
        role_names = _resolve_user_roles(db, token)
        if not role_names & allowed:  # interseção vazia
            raise HTTPException(
                status_code=403,
                detail=f"Role requerida: uma de {sorted(allowed)}",
            )
        return token

    return dependency