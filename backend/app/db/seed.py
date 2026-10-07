"""Seed inicial de desenvolvimento: roles e usuário administrativo.

Execução: ``python -m app.db.seed`` (idempotente).
"""
from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models import Role, User, UserRole

ROLES: tuple[tuple[str, str], ...] = (
    ("ADMIN", "Acesso total ao SIGDATA"),
    ("ANALISTA", "Cria e edita análises e painéis"),
    ("USUARIO", "Visualiza análises e painéis"),
)

ADMIN_USER = {
    "username": "admin",
    "full_name": "Lucas Admin",
    "email": None,
}


def seed_roles(session: Session) -> dict[str, int]:
    created = 0
    for name, description in ROLES:
        existing = session.scalar(select(Role).where(Role.name == name))
        if existing is None:
            session.add(Role(id=uuid.uuid4(), name=name, description=description))
            created += 1
    session.flush()
    return {"created": created, "total": len(ROLES)}


def seed_admin_user(session: Session) -> dict[str, int]:
    user = session.scalar(select(User).where(User.username == ADMIN_USER["username"]))
    created = 0
    if user is None:
        user = User(
            id=uuid.uuid4(),
            username=ADMIN_USER["username"],
            full_name=ADMIN_USER["full_name"],
            email=ADMIN_USER["email"],
            is_active=True,
        )
        session.add(user)
        session.flush()
        created = 1

    admin_role = session.scalar(select(Role).where(Role.name == "ADMIN"))
    if admin_role is None:
        raise RuntimeError("Role ADMIN não encontrada — execute seed_roles primeiro")

    link = session.scalar(
        select(UserRole).where(
            UserRole.user_id == user.id,
            UserRole.role_id == admin_role.id,
        )
    )
    linked = 0
    if link is None:
        session.add(UserRole(user_id=user.id, role_id=admin_role.id))
        linked = 1

    return {"created": created, "linked": linked}


def counts(session: Session) -> dict[str, int]:
    return {
        "users": session.scalar(select(func.count()).select_from(User)) or 0,
        "roles": session.scalar(select(func.count()).select_from(Role)) or 0,
        "user_roles": session.scalar(select(func.count()).select_from(UserRole)) or 0,
    }


def run_seed(session: Session) -> dict[str, int]:
    seed_roles(session)
    seed_admin_user(session)
    session.commit()
    return counts(session)


def main() -> None:
    with SessionLocal() as session:
        result = run_seed(session)
    print(
        "Seed concluído — "
        f"users={result['users']} roles={result['roles']} user_roles={result['user_roles']}"
    )


if __name__ == "__main__":
    main()
