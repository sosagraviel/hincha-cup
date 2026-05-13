#!/usr/bin/env bash
# Switch firebase + gcloud project alias.
set -euo pipefail
TARGET="${1:-default}"
firebase use "$TARGET"
gcloud config set project "mini-serverless-${TARGET}"
echo "switched to environment: $TARGET"
