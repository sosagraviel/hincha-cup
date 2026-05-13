#!/usr/bin/env bash
# Verifies all required CLIs are installed before bootstrap.
set -euo pipefail

REQUIRED=(node pnpm python3 poetry firebase gcloud)
MISSING=()
for cmd in "${REQUIRED[@]}"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    MISSING+=("$cmd")
  fi
done

if [ ${#MISSING[@]} -ne 0 ]; then
  echo "ERROR: missing CLIs: ${MISSING[*]}" >&2
  exit 1
fi
echo "all required CLIs present"
