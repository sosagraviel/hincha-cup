#!/usr/bin/env bash
# Bootstrap script. Real targets run inside the devcontainer's
# `postCreateCommand` and as the `make setup` recipe's dependency.
# Production-shaped (not a stub).
set -euo pipefail

echo "==> checking required tools"
for cmd in node pnpm docker; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: missing '$cmd'" >&2
    exit 1
  fi
done

echo "==> installing dependencies"
pnpm install --frozen-lockfile

echo "==> spinning up infrastructure"
docker compose up -d postgres redis keycloak

echo "==> waiting for postgres"
./scripts/wait-for-postgres.sh

echo "==> applying migrations"
pnpm --filter @mini-monorepo/backend db:migrate

echo "==> seeding"
pnpm --filter @mini-monorepo/seeds seed

echo "==> setup complete — try 'make dev'"
