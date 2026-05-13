#!/usr/bin/env bash
set -euo pipefail
pnpm exec eslint .
pnpm exec prettier --check .
