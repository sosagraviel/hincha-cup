#!/usr/bin/env bash
set -euo pipefail

source /usr/local/bin/entrypoint-common.sh

export FIRESTORE_EMULATOR_HOST="${FIRESTORE_EMULATOR_HOST:-emulators:8081}"
export VITE_FIREBASE_PROJECT_ID="${VITE_FIREBASE_PROJECT_ID:-gritogol}"

echo "Seeding Firestore emulator at ${FIRESTORE_EMULATOR_HOST}..."
exec npm run seed:emulator
