#!/usr/bin/env bash
set -euo pipefail
poetry run ruff check functions/python
poetry run black --check functions/python
