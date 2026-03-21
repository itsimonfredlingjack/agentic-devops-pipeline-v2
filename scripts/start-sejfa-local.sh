#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
STATE_DIR="${TMPDIR:-/tmp}/sejfa-local"

VOICE_PORT="${SEJFA_VOICE_PORT:-8000}"
MONITOR_PORT="${SEJFA_MONITOR_PORT:-8110}"
COMPANION_PORT="${SEJFA_CHATGPT_COMPANION_PORT:-8788}"
DESKTOP_PORT="${SEJFA_DESKTOP_PORT:-5173}"

VOICE_PID_FILE="${STATE_DIR}/voice.pid"
MONITOR_PID_FILE="${STATE_DIR}/monitor.pid"
COMPANION_PID_FILE="${STATE_DIR}/companion.pid"
DESKTOP_PID_FILE="${STATE_DIR}/desktop.pid"

VOICE_LOG_FILE="${STATE_DIR}/voice.log"
MONITOR_LOG_FILE="${STATE_DIR}/monitor.log"
COMPANION_LOG_FILE="${STATE_DIR}/companion.log"
DESKTOP_LOG_FILE="${STATE_DIR}/desktop.log"

PYTHON_BIN="${PYTHON_BIN:-python3}"
START_DESKTOP="${SEJFA_LOCAL_START_DESKTOP:-false}"

export SEJFA_VOICE_URL="${SEJFA_VOICE_URL:-http://127.0.0.1:${VOICE_PORT}}"
export SEJFA_MONITOR_API_URL="${SEJFA_MONITOR_API_URL:-http://127.0.0.1:${MONITOR_PORT}}"
export SEJFA_CHATGPT_PUBLIC_BASE_URL="${SEJFA_CHATGPT_PUBLIC_BASE_URL:-http://127.0.0.1:${COMPANION_PORT}}"

mkdir -p "${STATE_DIR}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

wait_for_exit() {
  local pid="$1"
  local attempts="${2:-50}"

  while (( attempts > 0 )); do
    if ! kill -0 "${pid}" 2>/dev/null; then
      return 0
    fi
    sleep 0.1
    attempts=$((attempts - 1))
  done

  return 1
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

port_in_use() {
  local port="$1"
  lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
}

find_existing_pid() {
  local pattern="$1"
  pgrep -f "${pattern}" | head -n 1 || true
}

ensure_port_free() {
  local port="$1"
  local label="$2"

  if port_in_use "${port}"; then
    echo "${label} port ${port} is already in use." >&2
    echo "Set a different value before starting, for example:" >&2
    echo "  ${label}=<new-port> ./scripts/start-sejfa-local.sh start" >&2
    exit 1
  fi
}

start_voice() {
  local existing_pid
  existing_pid="$(find_existing_pid "uvicorn voice_pipeline.main:app .* --port ${VOICE_PORT}")"
  if [[ -n "${existing_pid}" ]]; then
    echo "${existing_pid}" > "${VOICE_PID_FILE}"
    log "Voice pipeline already running (pid ${existing_pid})"
    return
  fi

  if is_running "${VOICE_PID_FILE}"; then
    log "Voice pipeline already running (pid $(cat "${VOICE_PID_FILE}"))"
    return
  fi

  ensure_port_free "${VOICE_PORT}" "SEJFA_VOICE_PORT"
  (
    cd "${REPO_ROOT}"
    exec env SEJFA_VOICE_URL="${SEJFA_VOICE_URL}" \
      "${PYTHON_BIN}" -m uvicorn voice_pipeline.main:app \
      --host 127.0.0.1 \
      --port "${VOICE_PORT}" \
      --app-dir services/voice-pipeline/src
  ) >"${VOICE_LOG_FILE}" 2>&1 &
  echo "$!" > "${VOICE_PID_FILE}"
  log "Started voice pipeline (pid $(cat "${VOICE_PID_FILE}"))"
}

start_monitor() {
  local existing_pid
  existing_pid="$(find_existing_pid "uvicorn monitor.api:app .* --port ${MONITOR_PORT}")"
  if [[ -n "${existing_pid}" ]]; then
    echo "${existing_pid}" > "${MONITOR_PID_FILE}"
    log "Monitor API already running (pid ${existing_pid})"
    return
  fi

  if is_running "${MONITOR_PID_FILE}"; then
    log "Monitor API already running (pid $(cat "${MONITOR_PID_FILE}"))"
    return
  fi

  ensure_port_free "${MONITOR_PORT}" "SEJFA_MONITOR_PORT"
  (
    cd "${REPO_ROOT}"
    exec env SEJFA_MONITOR_PORT="${MONITOR_PORT}" \
      SEJFA_MONITOR_API_URL="${SEJFA_MONITOR_API_URL}" \
      "${PYTHON_BIN}" -m uvicorn monitor.api:app \
      --host 127.0.0.1 \
      --port "${MONITOR_PORT}" \
      --app-dir services/monitor-api/src
  ) >"${MONITOR_LOG_FILE}" 2>&1 &
  echo "$!" > "${MONITOR_PID_FILE}"
  log "Started monitor API (pid $(cat "${MONITOR_PID_FILE}"))"
}

start_companion() {
  local existing_pid
  existing_pid="$(find_existing_pid "uvicorn src.chatgpt_companion.mcp_server:app .* --port ${COMPANION_PORT}")"
  if [[ -n "${existing_pid}" ]]; then
    echo "${existing_pid}" > "${COMPANION_PID_FILE}"
    log "ChatGPT companion already running (pid ${existing_pid})"
    return
  fi

  if is_running "${COMPANION_PID_FILE}"; then
    log "ChatGPT companion already running (pid $(cat "${COMPANION_PID_FILE}"))"
    return
  fi

  ensure_port_free "${COMPANION_PORT}" "SEJFA_CHATGPT_COMPANION_PORT"
  (
    cd "${REPO_ROOT}"
    exec env SEJFA_MONITOR_API_URL="${SEJFA_MONITOR_API_URL}" \
      SEJFA_CHATGPT_COMPANION_PORT="${COMPANION_PORT}" \
      SEJFA_CHATGPT_PUBLIC_BASE_URL="${SEJFA_CHATGPT_PUBLIC_BASE_URL}" \
      "${PYTHON_BIN}" -m uvicorn src.chatgpt_companion.mcp_server:app \
      --host 127.0.0.1 \
      --port "${COMPANION_PORT}"
  ) >"${COMPANION_LOG_FILE}" 2>&1 &
  echo "$!" > "${COMPANION_PID_FILE}"
  log "Started ChatGPT companion (pid $(cat "${COMPANION_PID_FILE}"))"
}

start_desktop() {
  local existing_pid
  existing_pid="$(find_existing_pid "npm --workspace desktop run electron:dev")"
  if [[ -n "${existing_pid}" ]]; then
    echo "${existing_pid}" > "${DESKTOP_PID_FILE}"
    log "Desktop app already running (pid ${existing_pid})"
    return
  fi

  if is_running "${DESKTOP_PID_FILE}"; then
    log "Desktop app already running (pid $(cat "${DESKTOP_PID_FILE}"))"
    return
  fi

  ensure_port_free "${DESKTOP_PORT}" "SEJFA_DESKTOP_PORT"
  (
    cd "${REPO_ROOT}"
    exec env SEJFA_VOICE_URL="${SEJFA_VOICE_URL}" \
      SEJFA_MONITOR_API_URL="${SEJFA_MONITOR_API_URL}" \
      VITE_SEJFA_VOICE_URL="${SEJFA_VOICE_URL}" \
      VITE_SEJFA_MONITOR_URL="${SEJFA_MONITOR_API_URL}" \
      npm --workspace desktop run electron:dev -- --host 127.0.0.1 --port "${DESKTOP_PORT}"
  ) >"${DESKTOP_LOG_FILE}" 2>&1 &
  echo "$!" > "${DESKTOP_PID_FILE}"
  log "Started desktop app (pid $(cat "${DESKTOP_PID_FILE}"))"
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
  wait_for_exit "${pid}" || true
  rm -f "${pid_file}"
  log "Stopped ${name}"
}

health_summary() {
  local url="$1"
  if curl -fsS "${url}" >/dev/null 2>&1; then
    printf 'ok'
  else
    printf 'down'
  fi
}

show_status() {
  if is_running "${VOICE_PID_FILE}"; then
    log "Voice pipeline running (pid $(cat "${VOICE_PID_FILE}"))"
  else
    log "Voice pipeline stopped"
  fi

  if is_running "${MONITOR_PID_FILE}"; then
    log "Monitor API running (pid $(cat "${MONITOR_PID_FILE}"))"
  else
    log "Monitor API stopped"
  fi

  if is_running "${COMPANION_PID_FILE}"; then
    log "ChatGPT companion running (pid $(cat "${COMPANION_PID_FILE}"))"
  else
    log "ChatGPT companion stopped"
  fi

  if [[ "${START_DESKTOP}" == "true" ]]; then
    if is_running "${DESKTOP_PID_FILE}"; then
      log "Desktop app running (pid $(cat "${DESKTOP_PID_FILE}"))"
    else
      log "Desktop app stopped"
    fi
  fi

  log "Voice health:     ${SEJFA_VOICE_URL}/health ($(health_summary "${SEJFA_VOICE_URL}/health"))"
  log "Monitor health:   ${SEJFA_MONITOR_API_URL}/status ($(health_summary "${SEJFA_MONITOR_API_URL}/status"))"
  log "Companion health: http://127.0.0.1:${COMPANION_PORT}/health ($(health_summary "http://127.0.0.1:${COMPANION_PORT}/health"))"
  log "Companion MCP:    http://127.0.0.1:${COMPANION_PORT}/mcp"
  if [[ "${START_DESKTOP}" == "true" ]]; then
    log "Desktop dev URL:  http://127.0.0.1:${DESKTOP_PORT}"
  fi
}

show_logs() {
  log "Voice log:     ${VOICE_LOG_FILE}"
  log "Monitor log:   ${MONITOR_LOG_FILE}"
  log "Companion log: ${COMPANION_LOG_FILE}"
  if [[ "${START_DESKTOP}" == "true" ]]; then
    log "Desktop log:   ${DESKTOP_LOG_FILE}"
  fi
}

start_all() {
  command -v "${PYTHON_BIN}" >/dev/null 2>&1 || {
    echo "${PYTHON_BIN} is not installed or not on PATH" >&2
    exit 1
  }
  command -v npm >/dev/null 2>&1 || {
    echo "npm is not installed or not on PATH" >&2
    exit 1
  }

  start_voice
  start_monitor
  start_companion
  if [[ "${START_DESKTOP}" == "true" ]]; then
    start_desktop
  fi
  sleep 1
  show_status
  show_logs
}

stop_all() {
  if [[ "${START_DESKTOP}" == "true" ]]; then
    stop_process "desktop app" "${DESKTOP_PID_FILE}"
  fi
  stop_process "ChatGPT companion" "${COMPANION_PID_FILE}"
  stop_process "Monitor API" "${MONITOR_PID_FILE}"
  stop_process "voice pipeline" "${VOICE_PID_FILE}"
}

case "${1:-start}" in
  start)
    start_all
    ;;
  stop)
    stop_all
    ;;
  restart)
    stop_all
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
