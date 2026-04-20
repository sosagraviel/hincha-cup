#!/bin/bash
set -euo pipefail

if [ -x ".code-review-graph/code-review-graph" ]; then
  exec ".code-review-graph/code-review-graph" "$@"
fi

if command -v code-review-graph >/dev/null 2>&1; then
  exec code-review-graph "$@"
fi

if command -v uvx >/dev/null 2>&1; then
  exec uvx code-review-graph "$@"
fi

echo "code-review-graph is not available. Install uv, pipx, or code-review-graph." >&2
exit 127
