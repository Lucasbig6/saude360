from __future__ import annotations

import uuid
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.dependencies import (
    get_created_by,
    get_current_token,
    validate_access_token,
)
from app.superset import auth as superset_auth

router = APIRouter(prefix="/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(request: LoginRequest) -> dict[str, Any]:
    try:
        return await superset_auth.login(
            username=request.username,
            password=request.password,
        )
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code in (401, 403):
            raise HTTPException(
                status_code=401, detail="Credenciais inválidas"
            ) from exc
        raise HTTPException(
            status_code=502, detail="Erro ao comunicar com o serviço de autenticação"
        ) from exc
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503, detail="Serviço de autenticação indisponível"
        ) from None
    except Exception:
        raise HTTPException(
            status_code=502, detail="Erro interno na autenticação"
        ) from None


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/refresh")
async def refresh(request: RefreshRequest) -> dict[str, Any]:
    try:
        return await superset_auth.refresh_token(refresh_token=request.refresh_token)
    except httpx.HTTPStatusError as exc:
        if 400 <= exc.response.status_code < 500:
            raise HTTPException(
                status_code=401, detail="Token de refresh inválido ou expirado"
            ) from exc
        raise HTTPException(
            status_code=502, detail="Erro ao comunicar com o serviço de autenticação"
        ) from exc
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503, detail="Serviço de autenticação indisponível"
        ) from None
    except Exception:
        raise HTTPException(
            status_code=502, detail="Erro interno na renovação do token"
        ) from None


@router.get("/me")
async def get_me(
    token: str = Depends(get_current_token),
    user_id: uuid.UUID | None = Depends(get_created_by),
) -> dict[str, Any]:
    """Perfil do usuário autenticado.

    ``id`` é o uuid local do usuário (``users.id``) — ``None`` quando ainda
    não existe registro local para o ``sub`` do token. É o que permite ao
    frontend separar "meus" itens dos de terceiros.
    """
    claims = validate_access_token(token)
    return {
        "id": str(user_id) if user_id is not None else None,
        "sub": claims.get("sub"),
        "type": claims.get("type"),
        "fresh": claims.get("fresh"),
        "iat": claims.get("iat"),
        "exp": claims.get("exp"),
    }
