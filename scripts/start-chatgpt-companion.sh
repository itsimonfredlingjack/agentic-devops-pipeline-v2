#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
STATE_DIR="${TMPDIR:-/tmp}/sejfa-chatgpt-companion"
UVICORN_PID_FILE="${STATE_DIR}/uvicorn.pid"
CLOUDFLARED_PID_FILE="${STATE_DIR}/cloudflared.pid"
UVICORN_LOG_FILE="${STATE_DIR}/uvicorn.log"
CLOUDFLARED_LOG_FILE="${STATE_DIR}/cloudflared.log"

mkdir -p "${STATE_DIR}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

find_existing_pid() {
  local pattern="$1"
  pgrep -f "${pattern}" | head -n 1 || true
}

is_running() {
  local pid_file="$1"
  if [[ ! -f "${pid_file}" ]]; then
    return 1
  fi

  local pid
  pid="$(cat "${pid_file}")"
  if [[ -z "${pid}" ]]; then
    return 1
  fi

  if kill -0 "${pid}" 2>/dev/null; then
    return 0
  fi

  rm -f "${pid_file}"
  return 1
}

start_uvicorn() {
  local existing_pid
  existing_pid="$(find_existing_pid 'uvicorn src.chatgpt_companion.mcp_server:app --host 0.0.0.0 --port 8787')"
  if [[ -n "${existing_pid}" ]]; then
    echo "${existing_pid}" > "${UVICORN_PID_FILE}"
    log "Companion server already running (pid ${existing_pid})"
    return
  fi

  if is_running "${UVICORN_PID_FILE}"; then
    log "Companion server already running (pid $(cat "${UVICORN_PID_FILE}"))"
    return
  fi

  (
    cd "${REPO_ROOT}"
    exec uvicorn src.chatgpt_companion.mcp_server:app --host 0.0.0.0 --port 8787
  ) >"${UVICORN_LOG_FILE}" 2>&1 &
  echo "$!" > "${UVICORN_PID_FILE}"
  log "Started companion server (pid $(cat "${UVICORN_PID_FILE}"))"
}

start_tunnel() {
  local existing_pid
  existing_pid="$(find_existing_pid 'cloudflared tunnel run macos-mcp')"
  if [[ -n "${existing_pid}" ]]; then
    echo "${existing_pid}" > "${CLOUDFLARED_PID_FILE}"
    log "Cloudflare tunnel already running (pid ${existing_pid})"
    return
  fi

  if is_running "${CLOUDFLARED_PID_FILE}"; then
    log "Cloudflare tunnel already running (pid $(cat "${CLOUDFLARED_PID_FILE}"))"
    return
  fi

  exec_cmd=(cloudflared tunnel run macos-mcp)
  "${exec_cmd[@]}" >"${CLOUDFLARED_LOG_FILE}" 2>&1 &
  echo "$!" > "${CLOUDFLARED_PID_FILE}"
  log "Started Cloudflare tunnel (pid $(cat "${CLOUDFLARED_PID_FILE}"))"
}

stop_process() {
  local name="$1"
  local pid_file="$2"

  if ! is_running "${pid_file}"; then
    log "${name} is not running"
    return
  fi

  local pid
  pid="$(cat "${pid_file}")"
  kill "${pid}" 2>/dev/null || true
  rm -f "${pid_file}"
  log "Stopped ${name}"
}

show_status() {
  if is_running "${UVICORN_PID_FILE}"; then
    log "Companion server running (pid $(cat "${UVICORN_PID_FILE}"))"
  else
    log "Companion server stopped"
  fi

  if is_running "${CLOUDFLARED_PID_FILE}"; then
    log "Cloudflare tunnel running (pid $(cat "${CLOUDFLARED_PID_FILE}"))"
  else
    log "Cloudflare tunnel stopped"
  fi

  log "Local health:  http://127.0.0.1:8787/health"
  log "Public health: https://sejfa-chat.fredlingautomation.dev/health"
  log "MCP URL:       https://sejfa-chat.fredlingautomation.dev/mcp"
}

show_logs() {
  log "Uvicorn log:     ${UVICORN_LOG_FILE}"
  log "Cloudflared log: ${CLOUDFLARED_LOG_FILE}"
}

start_all() {
  command -v uvicorn >/dev/null 2>&1 || {
    echo "uvicorn is not installed or not on PATH" >&2
    exit 1
  }
  command -v cloudflared >/dev/null 2>&1 || {
    echo "cloudflared is not installed or not on PATH" >&2
    exit 1
  }

  start_uvicorn
  start_tunnel
  sleep 1
  show_status
  show_logs
}

case "${1:-start}" in
  start)
    start_all
    ;;
  stop)
    stop_process "Cloudflare tunnel" "${CLOUDFLARED_PID_FILE}"
    stop_process "companion server" "${UVICORN_PID_FILE}"
    ;;
  restart)
    stop_process "Cloudflare tunnel" "${CLOUDFLARED_PID_FILE}"
    stop_process "companion server" "${UVICORN_PID_FILE}"
    start_all
    ;;
  status)
    show_status
    show_logs
    ;;
  logs)
    show_logs
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs}" >&2
    exit 1
    ;;
esac
