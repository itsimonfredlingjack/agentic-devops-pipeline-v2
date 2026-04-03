#!/usr/bin/env bash
# deploy-hetzner.sh — Deploy SEJFA to Hetzner via Docker Compose
#
# Usage:
#   bash scripts/deploy-hetzner.sh              # Deploy (pull + build + up)
#   bash scripts/deploy-hetzner.sh status       # Check service status
#   bash scripts/deploy-hetzner.sh logs         # Tail logs
#   bash scripts/deploy-hetzner.sh restart      # Restart all services
#   bash scripts/deploy-hetzner.sh down         # Stop all services
#
# Environment:
#   SEJFA_DOMAIN  — Domain for HTTPS (default: localhost)
#   DEPLOY_DIR    — Deployment directory (default: current dir)

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
COMPOSE_FILE="docker-compose.prod.yml"
COMPOSE="docker compose -f $COMPOSE_FILE"

cd "$DEPLOY_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

cmd_deploy() {
    log "Pulling latest code..."
    git pull --ff-only origin main

    log "Building images..."
    $COMPOSE build

    log "Starting services..."
    $COMPOSE up -d

    log "Waiting for health checks..."
    sleep 5

    $COMPOSE ps
    log "Deploy complete"
}

cmd_status() {
    $COMPOSE ps
    echo ""
    echo "--- Health ---"
    for svc in voice-pipeline monitor-api caddy; do
        status=$(docker inspect --format='{{.State.Health.Status}}' "sejfa-${svc/voice-pipeline/voice}" 2>/dev/null || echo "n/a")
        echo "  $svc: $status"
    done
}

cmd_logs() {
    $COMPOSE logs -f --tail=50
}

cmd_restart() {
    log "Restarting services..."
    $COMPOSE restart
    $COMPOSE ps
}

cmd_down() {
    log "Stopping services..."
    $COMPOSE down
    log "All services stopped"
}

case "${1:-deploy}" in
    deploy)  cmd_deploy ;;
    status)  cmd_status ;;
    logs)    cmd_logs ;;
    restart) cmd_restart ;;
    down)    cmd_down ;;
    *)
        echo "Usage: $0 {deploy|status|logs|restart|down}"
        exit 1
        ;;
esac
