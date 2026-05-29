## @setup
setup: ## @setup Install JS + Python deps
	pnpm install
	cd functions/python && poetry install

## @dev
emulators: ## @dev Start Firebase emulator suite (firestore + functions + auth + storage)
	cd firebase && firebase emulators:start --import=./data --export-on-exit=./data

## @deploy
deploy: ## @deploy Deploy via Cloud Build
	gcloud builds submit --config cloudbuild.yaml

deploy.firebase: ## @deploy Deploy only Firebase
	cd firebase && firebase deploy

## @test
test: ## @test Run all tests
	pnpm --recursive test
	cd functions/python && poetry run pytest

## @lint
lint: ## @lint Lint JS + Python
	./linter.sh

help: ## Show this help
	@grep -E '^[a-zA-Z._]+:.*?## ' $(MAKEFILE_LIST) | awk -F: '{printf "%-20s %s\n", $$1, $$NF}'

.PHONY: setup emulators deploy deploy.firebase test lint help
