SHELL := /bin/bash

.PHONY: dev dev-f dev-b dev-host build lint test stop stop-host stop-f stop-b superset-up superset-down superset-seed db-up db-down db-migrate db-seed db-migrate-host db-seed-host down clean logs help

help: ## Mostra ajuda
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

dev: ## Sobe stack completa em containers (db + superset + backend + frontend)
	docker compose up --build

dev-f: ## Inicia apenas frontend (container)
	docker compose up --build frontend

dev-b: ## Inicia apenas backend (container)
	docker compose up --build backend

dev-host: db-up db-migrate-host ## Sobe stack na host (sem Docker) — venv + npm
	@trap '$(MAKE) stop-host' INT TERM; \
	$(MAKE) -C frontend dev & pid_f=$$!; \
	$(MAKE) -C backend dev & pid_b=$$!; \
	wait -n $$pid_f $$pid_b; st=$$?; \
	$(MAKE) stop-host; \
	exit $$st

logs: ## Tail dos logs de todos os containers
	docker compose logs -f

stop: ## Para todos os containers (mantém volumes)
	docker compose stop

stop-host: ## Para processos da host (frontend + backend)
	@$(MAKE) stop-f || true
	@$(MAKE) stop-b || true

stop-f: ## Para apenas frontend da host
	@pkill -f "[n]ext dev" 2>/dev/null && echo "Frontend parado" || echo "Frontend não rodando"

stop-b: ## Para apenas backend da host
	@pkill -f "[u]vicorn" 2>/dev/null && echo "Backend parado" || echo "Backend não rodando"

build: ## Builda frontend
	$(MAKE) -C frontend build

lint: ## Roda lint em todos
	$(MAKE) -C frontend lint
	$(MAKE) -C backend lint

test: ## Roda testes em todos
	$(MAKE) -C backend test

superset-up: ## Sobe Superset (Docker)
	docker compose up -d superset

superset-down: ## Para Superset
	docker compose stop superset

superset-seed: ## Popula dados DEMO no Superset
	docker compose up -d superset
	@echo "Aguardando Superset ficar pronto..."
	@sleep 5
	@echo "Executando seed..."
	docker compose exec superset python /app/seed_demo.py

db-up: ## Sobe o PostgreSQL do Saude360 (porta 5433)
	docker compose up -d --wait saude360-postgres

db-down: ## Para o PostgreSQL do Saude360
	docker compose stop saude360-postgres

db-migrate: ## Aplica migrations do Alembic no banco do Saude360
	docker compose exec backend alembic upgrade head

db-seed: ## Seed inicial (roles + usuário admin)
	docker compose exec backend python -m app.db.seed

db-migrate-host: ## Migrations na host (venv) — usado pelo dev-host
	@test -x backend/.venv/bin/alembic || { echo "Erro: backend/.venv não encontrado. Rode: make -C backend install"; exit 1; }
	cd backend && .venv/bin/alembic upgrade head

db-seed-host: ## Seed na host (venv)
	@test -x backend/.venv/bin/python || { echo "Erro: backend/.venv não encontrado. Rode: make -C backend install"; exit 1; }
	cd backend && .venv/bin/python -m app.db.seed

down: ## Para e remove todos os containers (mantém volumes)
	docker compose down

clean: ## Limpa caches
	$(MAKE) -C frontend clean
	$(MAKE) -C backend clean
