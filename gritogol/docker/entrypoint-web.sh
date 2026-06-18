#!/usr/bin/env bash
set -euo pipefail

source /usr/local/bin/entrypoint-common.sh

# In Docker, always use compose env (host .env.local may have invalid placeholders).
if [ -f /.dockerenv ]; then
  if [ -f docker/.env ]; then
    cp docker/.env .env.local
  elif [ -f docker/.env.example ]; then
    cp docker/.env.example .env.local
  fi
fi

echo "Starting Vite dev server..."
exec npm run dev -- --host 0.0.0.0 --port 5173
