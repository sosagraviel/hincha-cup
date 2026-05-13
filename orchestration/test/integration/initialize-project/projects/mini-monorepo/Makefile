## @setup
setup: ## @setup Full dev environment setup (install + docker + keycloak + seed)
	pnpm install
	docker compose up -d postgres redis keycloak
	./scripts/wait-for-postgres.sh
	pnpm --filter @mini-monorepo/backend db:migrate
	pnpm --filter @mini-monorepo/seeds seed

## @dev
dev: ## @dev Run backend + frontend in watch mode
	pnpm --parallel --filter '@mini-monorepo/*' dev

## @test
test: ## @test Run unit + integration tests across all services
	pnpm --recursive test

test.e2e: ## @test Run Playwright e2e tests
	pnpm exec playwright test --config e2e/playwright.config.ts

## @lint
lint: ## @lint Run ESLint + Prettier check across the workspace
	pnpm --recursive lint
	pnpm exec prettier --check .

## @db
db.migrate: ## @db Run TypeORM migrations against the dev database
	pnpm --filter @mini-monorepo/backend db:migrate

db.reset: ## @db Drop + recreate the dev database
	docker compose exec postgres psql -U user -c "DROP DATABASE mini_monorepo; CREATE DATABASE mini_monorepo;"
	$(MAKE) db.migrate

help: ## Show this help
	@grep -E '^[a-zA-Z._]+:.*?## ' $(MAKEFILE_LIST) | awk -F: '{printf "%-20s %s\n", $$1, $$NF}'

.PHONY: setup dev test test.e2e lint db.migrate db.reset help
