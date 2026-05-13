#!/usr/bin/env bash
# Matches clasp's sanity_check.sh — pre-deploy sanity gate.
set -euo pipefail

echo "==> verifying firebase project alias"
firebase use default >/dev/null

echo "==> verifying gcloud configuration"
gcloud config get-value project >/dev/null

echo "==> verifying env.json template up to date"
if ! grep -q '"projectId"' env.json.template; then
  echo "ERROR: env.json.template missing projectId" >&2
  exit 1
fi

echo "sanity check passed"
