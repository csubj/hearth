.DEFAULT_GOAL := help

# Use bash for recipes so we get pipefail and consistent behavior.
SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c

PNPM := pnpm

.PHONY: help install setup dev build start test test-watch lint format format-check typecheck check \
        db-migrate db-generate auth-bootstrap \
        docker-build docker-up docker-up-ghcr docker-down docker-logs smoke clean \
        docs-install docs-serve docs-build

help: ## Show this help
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

## --- Setup ---

install: ## Install dependencies with pnpm
	$(PNPM) install

setup: install ## Install deps and git hooks
	$(PNPM) exec lefthook install

## --- Development ---

dev: ## Run the local dev server
	$(PNPM) dev

build: ## Build for production
	$(PNPM) build

start: ## Start the production server
	$(PNPM) start

## --- Quality ---

test: ## Run tests once (vitest)
	$(PNPM) test

test-watch: ## Run tests in watch mode
	$(PNPM) run test:watch

lint: ## Lint with eslint
	$(PNPM) lint

format: ## Format with prettier
	$(PNPM) format

format-check: ## Check formatting without writing
	$(PNPM) run format:check

typecheck: ## Type-check with tsc
	$(PNPM) typecheck

check: lint typecheck test ## Run lint, typecheck, and tests

## --- Database ---

db-migrate: ## Apply drizzle migrations
	$(PNPM) run db:migrate

db-generate: ## Generate a new drizzle migration
	$(PNPM) run db:generate

auth-bootstrap: ## Create the first admin user (once per instance)
	$(PNPM) run auth:bootstrap

## --- Docker ---

docker-build: ## Build the Docker image via compose
	docker compose build

docker-up: ## Start the app with a locally built image
	docker compose up -d --build

docker-up-ghcr: ## Start the app using the published GHCR image
	docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d

docker-down: ## Stop and remove containers
	docker compose down

docker-logs: ## Tail app container logs
	docker compose logs -f app

smoke: ## Run the docker smoke test
	$(PNPM) run smoke:docker

## --- Housekeeping ---

clean: ## Remove build artifacts and caches
	rm -rf .next node_modules/.cache

## --- Documentation ---

docs-install: ## Install MkDocs + Material (Python)
	python3 -m pip install -r requirements-docs.txt

docs-serve: ## Preview docs locally at http://127.0.0.1:8000
	python3 -m mkdocs serve

docs-build: ## Build static docs site to site/
	python3 -m mkdocs build
