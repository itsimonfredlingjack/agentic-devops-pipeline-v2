#!/usr/bin/env bash
# loop-runner.sh — Polls the voice pipeline backend for pending tickets
# and starts Claude Code's Ralph Loop (/start-task) for each one.
#
# Usage:
#   bash scripts/loop-runner.sh
#
# Environment variables:
#   LOOP_RUNNER_BACKEND_URL  — Backend URL (default: http://localhost:8000)
#   LOOP_RUNNER_REPO_DIR     — Path to agentic-devops-loop (default: current dir)
#   LOOP_RUNNER_POLL_INTERVAL — Seconds between polls (default: 10)
#
# Intended to run in a tmux session or as a systemd service.

set -euo pipefail

BACKEND_URL="${LOOP_RUNNER_BACKEND_URL:-http://localhost:8000}"
REPO_DIR="${LOOP_RUNNER_REPO_DIR:-$(pwd)}"
POLL_INTERVAL="${LOOP_RUNNER_POLL_INTERVAL:-10}"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

log "Loop runner started"
log "  Backend: $BACKEND_URL"
log "  Repo:    $REPO_DIR"
log "  Poll:    ${POLL_INTERVAL}s"

while true; do
    # Fetch first pending ticket from the queue
    ticket_key=$(curl -sf "$BACKEND_URL/api/loop/queue" | jq -r '.[0].key // empty' 2>/dev/null || true)

    if [ -n "$ticket_key" ]; then
        log "Picked up ticket: $ticket_key"

        # Notify backend that we're starting
        curl -sf -X POST "$BACKEND_URL/api/loop/started" \
            -H 'Content-Type: application/json' \
            -d "{\"key\":\"$ticket_key\"}" >/dev/null 2>&1 || true

        # Run Claude Code with /start-task in the repo directory
        log "Starting Ralph Loop for $ticket_key in $REPO_DIR"
        cd "$REPO_DIR"

        exit_code=0
        claude --print "/start-task $ticket_key" 2>&1 | tee "/tmp/ralph-$ticket_key.log" || exit_code=$?

        if [ "$exit_code" -eq 0 ]; then
            success=true
        else
            success=false
        fi

        log "Loop finished for $ticket_key (success=$success, exit=$exit_code)"

        # Notify backend of completion
        curl -sf -X POST "$BACKEND_URL/api/loop/completed" \
            -H 'Content-Type: application/json' \
            -d "{\"key\":\"$ticket_key\",\"success\":$success}" >/dev/null 2>&1 || true
    fi

    sleep "$POLL_INTERVAL"
done
