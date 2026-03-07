#!/usr/bin/env bash
set -euo pipefail

API_URL="${MONITOR_API_URL:-https://grupp-ett-monitor-api.fredlingjacksimon.workers.dev}"
DASHBOARD_URL="${MONITOR_DASHBOARD_URL:-https://ralph-monitor.pages.dev/monitor}"
HOOKS_DIR="${MONITOR_HOOKS_DIR:-$(cd "$(dirname "$0")/../.claude/hooks" && pwd)}"
API_SECRET="${MONITOR_API_SECRET:-}"

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${CYAN}▸${NC} $1"; }
ok()  { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v python3 >/dev/null 2>&1 || fail "python3 is required"

AUTH_HEADERS=()
if [[ -n "$API_SECRET" ]]; then
  AUTH_HEADERS=(-H "Authorization: Bearer $API_SECRET")
fi

api_get() {
  local path="$1"
  if [[ ${#AUTH_HEADERS[@]} -gt 0 ]]; then
    curl -fsS "${AUTH_HEADERS[@]}" "${API_URL}${path}"
  else
    curl -fsS "${API_URL}${path}"
  fi
}

api_post() {
  local path="$1"
  local payload="$2"
  if [[ ${#AUTH_HEADERS[@]} -gt 0 ]]; then
    curl -fsS -X POST "${AUTH_HEADERS[@]}" -H "Content-Type: application/json" -d "$payload" "${API_URL}${path}"
  else
    curl -fsS -X POST -H "Content-Type: application/json" -d "$payload" "${API_URL}${path}"
  fi
}

assert_json() {
  local code="$1"
  python3 -c "$code"
}

log "Checking dashboard endpoint"
curl -fsSI "$DASHBOARD_URL" >/dev/null
ok "Dashboard reachable: $DASHBOARD_URL"

log "Checking worker health"
health_json="$(api_get /health)"
printf '%s' "$health_json" | assert_json "import json,sys; d=json.load(sys.stdin); assert d.get('status')=='healthy', d"
ok "Worker health is healthy"

log "Resetting monitor state"
api_post /api/monitor/reset '{}' >/dev/null
state_json="$(api_get /api/monitor/state)"
printf '%s' "$state_json" | assert_json "import json,sys; d=json.load(sys.stdin); assert d.get('current_node') is None, d; assert d.get('event_log')==[], d"
ok "State reset verified"

log "Posting node transitions"
for node in jira claude github jules actions; do
  msg="verify-${node}-$(date +%s)"
  api_post /api/monitor/state "{\"node\":\"${node}\",\"state\":\"active\",\"message\":\"${msg}\"}" >/dev/null
  sleep 0.2
done

state_json="$(api_get /api/monitor/state)"
printf '%s' "$state_json" | assert_json "import json,sys; d=json.load(sys.stdin); assert d.get('current_node')=='actions', d.get('current_node'); assert len(d.get('event_log', []))>=5, len(d.get('event_log', []))"
ok "Node transition sequence verified"

log "Posting task start and complete"
api_post /api/monitor/task '{"action":"start","task_id":"GE-SMOKE","title":"Cloud Smoke Task"}' >/dev/null
api_post /api/monitor/task '{"action":"complete"}' >/dev/null
state_json="$(api_get /api/monitor/state)"
printf '%s' "$state_json" | assert_json "import json,sys; d=json.load(sys.stdin); t=d.get('task_info', {}); assert t.get('title')=='Cloud Smoke Task', t; assert t.get('status')=='completed', t"
ok "Task lifecycle verified"

log "Testing monitor_client.py -> Worker"
client_out="$(
  MONITOR_URL="$API_URL" \
  MONITOR_ENABLED=1 \
  MONITOR_API_SECRET="$API_SECRET" \
  MONITOR_DEBUG=1 \
  python3 "${HOOKS_DIR}/monitor_client.py" claude "verify-hook-client"
)"
echo "$client_out"
[[ "$client_out" == *"OK"* ]] || fail "monitor_client.py failed to post update"
ok "monitor_client.py posting works"

log "Testing monitor_hook.py -> Worker"
hook_payload='{"tool_name":"Bash","tool_input":{"command":"pytest tests/test_app.py"}}'
printf '%s' "$hook_payload" | \
  MONITOR_URL="$API_URL" \
  MONITOR_ENABLED=1 \
  MONITOR_API_SECRET="$API_SECRET" \
  MONITOR_DEBUG=1 \
  python3 "${HOOKS_DIR}/monitor_hook.py"

sleep 1
state_json="$(api_get /api/monitor/state)"
printf '%s' "$state_json" | assert_json "import json,sys; d=json.load(sys.stdin); assert d.get('current_node')=='actions', d.get('current_node'); assert any(e.get('node')=='actions' for e in d.get('event_log', [])), d.get('event_log', [])[-3:]"
ok "monitor_hook.py posting works"

log "Resetting state after verification"
api_post /api/monitor/reset '{}' >/dev/null
ok "State cleaned up"

echo
ok "Cloud monitor verification passed"
echo "Dashboard: $DASHBOARD_URL"
echo "Worker API: $API_URL"
