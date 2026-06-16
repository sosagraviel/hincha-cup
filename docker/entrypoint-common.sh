#!/usr/bin/env bash
set -euo pipefail

cd /app

if [ ! -d node_modules ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
  echo "Installing app dependencies..."
  npm ci
fi

if [ ! -d functions/node_modules ] || [ -z "$(ls -A functions/node_modules 2>/dev/null)" ]; then
  echo "Installing functions dependencies..."
  (cd functions && npm ci)
fi

if [ ! -f functions/.env ] && [ -f functions/.env.example ]; then
  cp functions/.env.example functions/.env
fi
