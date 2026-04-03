#!/usr/bin/env bash
# loop-runner.sh — Starts the Python loop runner.
#
# Usage:
#   bash scripts/loop-runner.sh
#   bash services/loop-engine/scripts/loop-runner.sh
#
# Environment variables (see loop_engine/config.py for full list):
#   LOOP_RUNNER_BACKEND_URL   — Backend URL (default: http://localhost:8000)
#   LOOP_RUNNER_REPO_DIR      — Path to repo (default: current dir)
#   LOOP_RUNNER_POLL_INTERVAL — Seconds between polls (default: 10)
#
# Intended to run in a tmux session or as a systemd service.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if [[ -f "venv/bin/activate" ]]; then
    # shellcheck disable=SC1091
    source "venv/bin/activate"
fi

export PYTHONPATH="services/loop-engine/src:${PYTHONPATH:-}"

exec python3 -m loop_engine.runner "$@"
