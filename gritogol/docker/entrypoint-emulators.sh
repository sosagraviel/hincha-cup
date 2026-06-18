#!/usr/bin/env bash
set -euo pipefail

source /usr/local/bin/entrypoint-common.sh

echo "Building Cloud Functions..."
(cd functions && npm run build)

echo "Starting Firebase Emulator Suite..."
exec firebase emulators:start \
  --only auth,firestore,storage,functions \
  --project gritogol
