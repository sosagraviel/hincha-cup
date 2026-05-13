#!/usr/bin/env bash
# Pulls secrets from Doppler and writes them into env.json (matches clasp's flow).
set -euo pipefail
[ -n "${DOPPLER_TOKEN:-}" ] || { echo "DOPPLER_TOKEN required" >&2; exit 1; }
doppler secrets download --no-file --format json > env.json
echo "✓ env.json updated from doppler"
