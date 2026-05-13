#!/usr/bin/env bash
# Probe the local Firebase emulator suite.
set -euo pipefail

for host in localhost:8080 localhost:5001 localhost:9099 localhost:9199; do
  if curl -sf "http://$host" >/dev/null 2>&1; then
    echo "✓ $host"
  else
    echo "✗ $host"
  fi
done
