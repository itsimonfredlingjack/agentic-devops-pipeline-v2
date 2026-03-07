#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if [[ -f "venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "venv/bin/activate"
fi

ruff check .
ruff format --check .
pytest -q --cov=src --cov-report=term-missing --cov-fail-under=80
