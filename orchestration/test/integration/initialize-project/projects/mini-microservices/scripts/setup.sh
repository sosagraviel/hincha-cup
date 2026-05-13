#!/usr/bin/env bash
# Sets up the polyglot toolchain.
set -euo pipefail

echo "==> verifying tools"
for cmd in go dotnet python3 poetry pnpm docker; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "missing: $cmd" >&2; exit 1; }
done

echo "==> downloading go modules"
for svc in frontend productcatalogservice e2e; do
  (cd "$svc" && go mod download)
done

echo "==> restoring .NET"
(cd cartservice && dotnet restore)

echo "==> installing python deps"
(cd recommendationservice && poetry install)
(cd loadgenerator && poetry install)

echo "==> installing node deps"
(cd paymentservice && pnpm install --frozen-lockfile)

echo "==> setup complete"
