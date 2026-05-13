## @deploy
deploy.dry-run: ## @deploy Run pre-deploy + post-deploy without invoking firebase deploy
	node scripts/pre-deploy.js
	node scripts/post-deploy.js

## @install
install: ## @install Install deploy-time dependencies
	pnpm install

.PHONY: deploy.dry-run install
