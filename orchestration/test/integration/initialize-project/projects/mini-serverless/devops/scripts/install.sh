#!/usr/bin/env bash
set -euo pipefail
./check-requirements.sh
pnpm install
(cd ../functions/python && poetry install)
echo "install complete"
