## @setup
setup: ## @setup Install everything for every language
	./scripts/setup.sh

## @dev
dev: ## @dev Run Skaffold dev-loop
	skaffold dev

dev.compose: ## @dev Run via docker-compose
	docker compose up --build

## @test
test: ## @test Run tests across every language
	$(MAKE) test.go test.dotnet test.python test.node

test.go:
	cd frontend && go test ./...
	cd productcatalogservice && go test ./...
	cd e2e && go test ./...

test.dotnet:
	cd cartservice && dotnet test

test.python:
	cd recommendationservice && poetry run pytest

test.node:
	cd paymentservice && pnpm test

## @lint
lint: ## @lint Lint each language
	cd frontend && golangci-lint run
	cd productcatalogservice && golangci-lint run
	cd paymentservice && pnpm lint
	cd recommendationservice && poetry run ruff check .

## @proto
proto: ## @proto Regenerate gRPC stubs from pb/demo.proto
	./scripts/gen-protos.sh

help: ## Show this help
	@grep -E '^[a-zA-Z._]+:.*?## ' $(MAKEFILE_LIST) | awk -F: '{printf "%-20s %s\n", $$1, $$NF}'

.PHONY: setup dev dev.compose test test.go test.dotnet test.python test.node lint proto help
