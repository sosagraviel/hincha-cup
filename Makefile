.PHONY: help up start stop down down-volumes build recreate restart logs sh rebuild-packages tests setup seed launch

# Development
ENV_FILE ?= .env.development
COMPOSE_FILE ?= docker-compose.yml
COMPOSE_DEV = docker compose --file $(COMPOSE_FILE) --env-file $(ENV_FILE)

help:
	@echo "Available commands:"
	@echo "\n\033[1;34mDocker Commands:\033[0m"
	@grep -E '^[a-zA-Z_-]+:.*?## @docker.*$$' $(MAKEFILE_LIST) | sort | sed 's/@docker//' | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo "\n\033[1;34mSetup Commands:\033[0m"
	@grep -E '^[a-zA-Z_-]+:.*?## @setup.*$$' $(MAKEFILE_LIST) | sort | sed 's/@setup//' | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo "\n\033[1;34mTest Commands:\033[0m"
	@grep -E '^[a-zA-Z_-]+:.*?## @test.*$$' $(MAKEFILE_LIST) | sort | sed 's/@test//' | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

up: ## @docker Start all or a specific container. Usage: make up s=<service>
	$(COMPOSE_DEV) up -d $(s)
start: up ## @docker Alias for 'up'
stop: ## @docker Stop all or a specific container. Usage: make stop s=<service>
	$(COMPOSE_DEV) stop $(s)
down: ## @docker Stop and remove containers. Usage: make down s=<service>
	$(COMPOSE_DEV) down $(s)
down-volumes: ## @docker Stop containers and remove volumes. Usage: make down-volumes s=<service>
	$(COMPOSE_DEV) down -v $(s)
build: ## @docker Build all or a specific service. Usage: make build s=<service>
	$(COMPOSE_DEV) build $(s)
recreate: ## @docker Recreate service with fresh volumes. Usage: make recreate s=<service>
	$(COMPOSE_DEV) down -v $(s)
	$(COMPOSE_DEV) up -d --build --force-recreate $(s)
restart: ## @docker Restart all or a specific service. Usage: make restart s=<service>
	$(COMPOSE_DEV) restart $(s)
logs: ## @docker Show logs for a service. Usage: make logs s=<service>
	$(COMPOSE_DEV) logs -f $(s)
sh: ## @docker Shell into a container. Usage: make sh s=<service>
	@if [ -z "$(s)" ]; then \
		echo "Error: specify service. Usage: make sh s=<service>"; \
		exit 1; \
	fi
	$(COMPOSE_DEV) exec $(s) bash
rebuild-packages: ## @docker Recompile packages and rebuild service. Usage: make rebuild-packages s=<service>
	@if [ -z "$(s)" ]; then \
		echo "Error: specify service. Usage: make rebuild-packages s=<service>"; \
		exit 1; \
	fi
	$(COMPOSE_DEV) down $(s)
	pnpm --filter "@livonit/*" build
	$(COMPOSE_DEV) up -d --build $(s)

tests: ## @test Run all tests (unit, integration, e2e)
	pnpm --filter ./services/backend test:unit
	pnpm --filter ./services/backend test:integration
	pnpm --filter ./services/web-frontend test:e2e

setup: ## @setup Full dev environment setup (install, docker, keycloak, seed)
	@echo "Installing dependencies..."
	pnpm install
	@echo ""

	@if [ ! -f $(ENV_FILE) ]; then \
		echo "Creating $(ENV_FILE) file..."; \
		cp .env.development.example $(ENV_FILE); \
	fi

	@echo "Starting services..."
	$(COMPOSE_DEV) up -d
	@echo ""

	@set -a; \
	. ./$(ENV_FILE); \
	set +a; \
	SERVICE_URL="$$KEYCLOAK_EXTERNAL_MGMT_URL/health/ready"; \
	MAX_RETRIES=30; \
	RETRY_INTERVAL=5; \
	./scripts/wait_for_service "$$SERVICE_URL" $$MAX_RETRIES $$RETRY_INTERVAL "Keycloak service not ready"

	@echo ""
	@echo "Initializing Keycloak realm..."
	pnpm --filter ./services/keycloak run init
	@echo ""

	@set -a; \
	. ./$(ENV_FILE); \
	set +a; \
	SERVICE_URL=$$CLIENT_URL:$$API_PORT/$$API_PREFIX/health; \
	MAX_RETRIES=20; \
	RETRY_INTERVAL=5; \
	bash scripts/wait_for_service "$$SERVICE_URL" $$MAX_RETRIES $$RETRY_INTERVAL "API service not ready"

	@echo ""
	@echo "Seeding demo data..."
	make seed
	@echo ""
	@echo "Setup complete!"
	@echo "  Frontend: http://localhost:2712"
	@echo "  Backend:  http://localhost:3050"
	@echo "  Keycloak: http://localhost:7080"
	@echo "  Admin:    admin@gira.com / admin123"

seed: ## @setup Seed demo data into the database
	@cd seeds/scripts && \
	npx ts-node seed-demo-data.ts ../../$(ENV_FILE)

launch: ## @setup Full reset: down-volumes then setup
	@echo "Removing old containers..."
	make down-volumes
	@echo "Setting up..."
	make setup
