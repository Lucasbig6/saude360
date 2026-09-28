#!/bin/sh
set -e

echo "[backend] Aplicando migrations (alembic upgrade head)..."
alembic upgrade head

echo "[backend] Rodando seed idempotente (roles + admin)..."
python -m app.db.seed

echo "[backend] Iniciando uvicorn com reload..."
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --reload \
    --reload-dir app \
    --reload-dir alembic \
    "$@"
