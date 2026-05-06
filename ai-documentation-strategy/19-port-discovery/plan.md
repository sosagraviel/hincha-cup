# Plan 19 — Stack-agnostic per-service port discovery

**Status:** awaiting confirmation. Do NOT implement until approved.
**Author:** assistant, 2026-05-06
**Triggered by:** gira run produced "verify in `services/backend/src/main.ts`"
in the `Services & Ports` table instead of the actual port. Real
ports were `2712` (web-frontend, in `package.json` script
`vite --host 0.0.0.0 --port 2712` AND in `docker-compose.yml`
mapping `2712:2712`), `3050` (backend, in `.env.development`
`API_PORT=3050`), `7080` (Keycloak, in `.env.development`
`KEYCLOAK_HTTP_PORT=7080`).

The framework either guessed default ports (`3000`, `5173`,
`8080`) or punted with a "verify in X" placeholder. Three
authoritative sources were ignored.

This plan is **prompt-only**. Stack-agnostic — every source is a
file shape that exists across every language family the framework
supports.

---

## A. Stack-agnosticism contract (load-bearing)

The framework runs in 600+ projects across every supported
language family: Node/TS (NestJS, Next, Express, Vite, Fastify,
Hapi), Python (Flask, Django, FastAPI, Uvicorn, gunicorn), Java /
Kotlin (Spring Boot, Tomcat), Go (Gin, Echo, Fiber, net/http),
Rust (Actix, Axum, Rocket), Ruby (Rails, Sinatra, puma), PHP
(Laravel, Symfony, php-fpm), .NET (Kestrel, IIS), Elixir
(Phoenix), Scala (Akka, Play). The plan must NOT assume any
specific framework or language.

The fix lives in **one prompt section** and instructs the agent
to walk a list of source-file shapes that span every stack. The
agent already discovers service paths in Phase 1; this plan
extends discovery to per-service port assignment using files
that exist across stacks.

Single-service / multi-repo / serverless / polyglot all work the
same way: the agent walks the source list per service and emits
`environment.port` when any source resolves a value. When no
source resolves, the field stays absent (no fabrication).

---

## B. The fix — one prompt section

**File:** `orchestration/src/nodes/initialize-project/phase1/structure-analyzer/prompts/agent.md`

Add a new section near the existing "Mode 2 — Mandatory file
reads" block (per-service port assignment is a file-content task
the graph cannot answer):

```md
## Per-service port discovery — populate `environment.port` for every service

For every service in `findings.services[]`, fill `environment.port`
by reading the source list below in order. The first source that
resolves a numeric port wins. If none resolve, OMIT the `port`
field — do NOT fabricate a default.

### Source list (stack-agnostic, walk in this order)

1. **Container-orchestration mappings (highest priority)** —
   `docker-compose.yml`, `docker-compose.*.yml`, `compose.yaml`,
   `Dockerfile.dev`. Read each `services.<svc>.ports:` block and
   match the service id (or path basename) against the
   compose-service name. The HOST-side port (left of `:`) is the
   port the operator runs against.

2. **Per-service environment files (development)** — `.env`,
   `.env.development`, `.env.local`, `.env.example`, plus the
   per-service variant under `<service-path>/.env*`. Look for
   `*PORT` / `*_PORT` keys (`PORT`, `API_PORT`, `APP_PORT`,
   `SERVER_PORT`, `HTTP_PORT`, `KEYCLOAK_HTTP_PORT`, etc.). Match
   to a service by name proximity (`API_PORT` → backend service
   when only one backend exists; `KEYCLOAK_*` → keycloak service)
   or by reading the corresponding service's manifest for the env
   var consumer.

3. **Service manifest scripts** — the per-language manifest's
   run/start command:
   - **Node / TS**: `package.json` `scripts.{start,dev,start:dev,serve}`
     — look for `--port N`, `-p N`, `PORT=N` prefixes.
   - **Python**: `pyproject.toml` `[tool.poetry.scripts]` /
     `[project.scripts]`, or top-level `Procfile` / `manage.py runserver`
     args. Look for `--port`, `:N` after a host, `PORT=N`.
   - **Go**: `Makefile` / `Justfile` / scripts; `main.go` `ListenAndServe(":N", ...)`.
   - **Java / Kotlin**: `application.yml` / `application.properties`
     — `server.port: N` / `server.port=N`. Spring Boot also
     accepts `SERVER_PORT` env var.
   - **Rust**: `Cargo.toml` `[package.metadata]` or
     `src/main.rs` `bind("0.0.0.0:N")`.
   - **Ruby / Rails**: `config/puma.rb` `port N`, `Procfile`,
     `bin/rails server -p N`.
   - **PHP / Laravel**: `.env` `APP_PORT`, `php artisan serve --port=N`.
   - **.NET**: `Properties/launchSettings.json`
     `applicationUrl` / `iisSettings.iisExpress.applicationUrl`.
   - **Elixir / Phoenix**: `config/{dev,prod,runtime}.exs`
     `Endpoint, http: [port: N]`.

4. **Container exposure (lower priority — usually a default)** —
   `Dockerfile` `EXPOSE N`. This is the runtime default, often
   the same as the service's hardcoded port; only use when no
   higher-priority source resolves.

5. **Deployment / cloud configs** — `serverless.yml`
   `httpApi.cors.events`, `app.yaml` `runtime_config.port`,
   `vercel.json` / `netlify.toml`, k8s manifests
   `spec.containers[].ports[].containerPort`. Lower priority
   than dev-time sources because production may differ.

6. **README "Getting Started" verbatim** — port numbers
   mentioned in fenced code blocks (`make setup` / `localhost:N`)
   under `## Getting Started` or `## Setup` headings. Lowest
   priority — README values may drift from code.

### Output rule

When a source resolves, set `environment.port: N` (integer) on
the matching service. When NO source resolves for a service,
OMIT `environment.port` entirely — do NOT use the framework's
"default port" (3000 for NestJS, 5173 for Vite, 8080 for
Keycloak, etc.). The framework's default ports are guesses; an
absent field is more honest than a wrong number.

### Multi-port services (rare)

If a service exposes multiple ports (e.g. HTTP + admin + metrics),
prefer the one that maps to the dev workflow — the port the
developer hits in the browser or with `curl`. Heuristic: pick the
docker-compose mapping that ALSO appears in the README's "Getting
Started" / "Setup" section.

### Concrete examples (stack-agnostic shapes)

- `package.json`: `"start:dev": "vite --host 0.0.0.0 --port 2712"` → port `2712`.
- `.env.development`: `API_PORT=3050` matched to a backend service → port `3050`.
- `docker-compose.yml`:
  ```yaml
  services:
    keycloak:
      ports:
        - "${KEYCLOAK_HTTP_PORT:-7080}:8080"
  ```
  → port `7080` (host side; `${KEYCLOAK_HTTP_PORT:-7080}` reads to `7080` from `.env`).
- Spring Boot `application.yml`: `server: { port: 8443 }` → port `8443`.
- Phoenix `config/runtime.exs`: `port = String.to_integer(System.get_env("PHX_PORT") || "4000")` → port `4000` (fallback).
- `manage.py runserver 0.0.0.0:8000` (Django default) → port `8000`.
```

That's it. ~70 lines of prompt content; no schema changes; no
new validators; no Phase 4 code changes; no new tests beyond the
existing structure-analyzer integration coverage which already
asserts that `environment.port` is populated when sources exist.

---

## C. What this plan explicitly does NOT do

- ❌ No new TypeScript helpers / new files
- ❌ No new Stop-hook validators
- ❌ No deterministic post-process (Option B from the discussion
  was rejected in favour of the simpler prompt-only path)
- ❌ No schema changes (`environment.port` already exists in
  `ServiceEnvironmentSchema`)
- ❌ No changes to other analyzers
- ❌ No changes to Phase 3 / Phase 4 / wiki / skills

Single prompt edit, single commit.

---

## D. Tests

No new tests. The change is a prompt instruction the agent
follows; no deterministic logic to assert. The existing
integration test that runs the analyzer on a fixture will exercise
the new behavior.

If a smoke check is desired: re-run `/initialize-project` on
gira post-sync and inspect `framework-config.json::stack_profile.services[].environment.port`
for `backend` (expect `3050`), `web-frontend` (expect `2712`),
`keycloak` (expect `7080`).

---

## E. Acceptance criteria

After this lands and gira is re-initialised:

- [ ] `framework-config.json::stack_profile.services[].environment.port`
      is populated with `3050` for backend, `2712` for web-frontend,
      `7080` for keycloak (all read from
      `.env.development` / `package.json` / `docker-compose.yml`).
- [ ] CLAUDE.md `Services & Ports` table lists the actual ports,
      not "verify in X" placeholders.
- [ ] When a project has NO discoverable port for a service, the
      field is absent — not a fabricated default.

---

## F. Stack-agnostic regression check

The plan must hold for projects without docker-compose / without
`.env*` / without `package.json`. In each case, the agent walks
the source list and emits a port only when one resolves:

- Pure Python project (Django + `manage.py`): port read from
  `manage.py runserver 0.0.0.0:N` or `settings.py` `RUNSERVER_PORT`.
- Pure Go project (single binary): port read from `main.go`
  `ListenAndServe(":N")` or `Makefile` `run` target.
- Java Spring Boot: port read from `application.yml`
  `server.port`.
- Serverless (multiple Lambdas): no ports — field absent for
  every function.
- .NET: port read from `Properties/launchSettings.json`.
- Multi-repo where the framework runs per-repo: each repo's
  source list resolves independently.

---

**Awaiting your confirmation or change requests before I touch
any code.**
