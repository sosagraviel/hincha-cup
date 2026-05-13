#!/usr/bin/env bash
# Top-level linter — fans out to language-specific linters.
set -euo pipefail
echo "==> JS/TS lint"
./js_linter.sh
echo "==> Python lint"
./py_linter.sh
