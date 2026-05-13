#!/usr/bin/env bash
# Wait for the postgres container to accept connections. Used by the
# Makefile + setup.sh + CI.
set -euo pipefail

MAX_ATTEMPTS=30
for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  if docker compose exec -T postgres pg_isready -U user -d mini_monorepo >/dev/null 2>&1; then
    echo "postgres ready"
    exit 0
  fi
  echo "waiting for postgres (attempt $attempt/$MAX_ATTEMPTS)..."
  sleep 2
done

echo "ERROR: postgres did not become ready within $((MAX_ATTEMPTS * 2))s" >&2
exit 1
