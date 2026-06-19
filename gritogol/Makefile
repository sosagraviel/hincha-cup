.PHONY: start stop rebuild logs seed status clean-docker standalone-branch

COMPOSE := docker compose

start:
	@test -f docker/.env || cp docker/.env.example docker/.env
	@if lsof -iTCP:5173 -sTCP:LISTEN -t >/dev/null 2>&1; then \
		echo "Error: puerto 5173 ocupado (¿tenés npm run dev local?). Paralo y volvé a intentar."; \
		exit 1; \
	fi
	$(COMPOSE) up -d --build

stop:
	$(COMPOSE) down

rebuild:
	$(COMPOSE) down
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d

logs:
	$(COMPOSE) logs -f

seed:
	$(COMPOSE) up -d emulators
	$(COMPOSE) run --rm seed

status:
	$(COMPOSE) ps

clean-docker:
	docker system prune -af --volumes
	@echo "Docker disk cleaned. Run: make rebuild"

standalone-branch:
	git subtree split --prefix=gritogol/ -b gritogol-standalone HEAD
	git push origin gritogol-standalone --force
