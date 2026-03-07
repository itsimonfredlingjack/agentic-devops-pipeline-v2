#!/usr/bin/env bash
set -euo pipefail

pass_count=0
warn_count=0
fail_count=0

print_header() {
  cat <<'TXT'
PREFLIGHT CHECKS
=========================================
TXT
}

print_footer() {
  echo ""
  echo "========================================="
  if [[ "$fail_count" -eq 0 ]]; then
    echo "READY FOR /start-task"
    if [[ "$warn_count" -gt 0 ]]; then
      echo "Warnings: ${warn_count}"
    fi
  else
    echo "NOT READY FOR /start-task"
    echo "Blockers: ${fail_count} error(s), ${warn_count} warning(s)"
  fi
}

report_pass() {
  echo "[OK]   $1"
  pass_count=$((pass_count + 1))
}

report_warn() {
  echo "[WARN] $1"
  if [[ -n "${2:-}" ]]; then
    echo "       -> ${2}"
  fi
  if [[ -n "${3:-}" ]]; then
    echo "          Action: ${3}"
  fi
  warn_count=$((warn_count + 1))
}

report_fail() {
  echo "[FAIL] $1"
  if [[ -n "${2:-}" ]]; then
    echo "       -> ${2}"
  fi
  if [[ -n "${3:-}" ]]; then
    echo "          Action: ${3}"
  fi
  fail_count=$((fail_count + 1))
}

is_ci() {
  [[ "${CI:-}" == "true" || "${GITHUB_ACTIONS:-}" == "true" ]]
}

check_git_clean() {
  local status_output
  status_output="$(git status --porcelain 2>/dev/null || true)"
  if [[ -z "$status_output" ]]; then
    report_pass "Git working tree clean"
  else
    report_fail "Git working tree clean" \
      "Found uncommitted changes." \
      "Commit or stash local changes before /start-task."
  fi
}

check_branch() {
  local branch
  branch="$(git branch --show-current 2>/dev/null || true)"
  if [[ "$branch" == "main" || "$branch" == "master" ]]; then
    report_pass "On main/master branch"
  else
    report_fail "On main/master branch" \
      "Current branch is '${branch:-unknown}'." \
      "Switch to main or master before /start-task."
  fi
}

check_jira() {
  if is_ci; then
    report_warn "Jira API responding" \
      "Skipped in CI health-check context." \
      "Validate Jira from a local dev shell before /start-task."
    return
  fi

  local python_bin="python3"
  if [[ -x "venv/bin/python" ]]; then
    python_bin="venv/bin/python"
  fi

  if ! command -v "$python_bin" >/dev/null 2>&1; then
    report_fail "Jira API responding" \
      "Python runtime '${python_bin}' not found." \
      "Install Python/venv dependencies."
    return
  fi

  local jira_output
  local jira_rc
  set +e
  jira_output="$($python_bin - <<'PY'
import os
from pathlib import Path


def load_env_file(path: str = ".env") -> None:
    p = Path(path)
    if not p.exists():
        return

    for raw in p.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_env_file()
required = ("JIRA_URL", "JIRA_EMAIL", "JIRA_API_TOKEN")
missing = [key for key in required if not os.getenv(key)]
if missing:
    print("missing_env=" + ",".join(missing))
    raise SystemExit(2)

from src.sejfa.integrations.jira_client import get_jira_client

client = get_jira_client()
if client.test_connection():
    print("ok")
else:
    print("connection_failed")
    raise SystemExit(1)
PY
  2>&1)"
  jira_rc=$?
  set -e

  if [[ "$jira_rc" -eq 0 ]]; then
    report_pass "Jira API responding"
  elif [[ "$jira_rc" -eq 2 ]]; then
    report_fail "Jira API responding" \
      "Missing Jira environment variables (${jira_output#missing_env=})." \
      "Set JIRA_URL, JIRA_EMAIL, and JIRA_API_TOKEN in .env."
  else
    report_fail "Jira API responding" \
      "Jira connection failed." \
      "Verify credentials/network before /start-task."
  fi
}

check_github_auth() {
  if is_ci; then
    report_warn "GitHub auth working" \
      "Skipped in CI health-check context." \
      "Validate gh/ssh auth from local dev shell."
    return
  fi

  local remote_url
  remote_url="$(git remote get-url origin 2>/dev/null || true)"

  if [[ "$remote_url" == https://* ]]; then
    if gh auth status >/dev/null 2>&1; then
      report_pass "GitHub auth working"
    else
      report_fail "GitHub auth working" \
        "gh auth status failed." \
        "Run 'gh auth login' to authenticate."
    fi
    return
  fi

  local ssh_output
  set +e
  ssh_output="$(ssh -T -o BatchMode=yes -o StrictHostKeyChecking=accept-new git@github.com 2>&1)"
  set -e
  if [[ "$ssh_output" == *"successfully authenticated"* || "$ssh_output" == *"You've successfully authenticated"* || "$ssh_output" == Hi\ * ]]; then
    report_pass "GitHub auth working"
  else
    report_fail "GitHub auth working" \
      "SSH auth check failed." \
      "Fix SSH keys or switch origin to HTTPS + gh auth."
  fi
}

check_environment() {
  local missing=()

  [[ -f ".claude/settings.local.json" ]] || missing+=(".claude/settings.local.json")
  [[ -f "CURRENT_TASK.md" ]] || missing+=("CURRENT_TASK.md")

  if [[ "${#missing[@]}" -gt 0 ]]; then
    report_fail "Environment configured" \
      "Missing required file(s): ${missing[*]}" \
      "Restore missing files before /start-task."
    return
  fi

  report_pass "Environment configured"

  if grep -qiE "no active task|ingen aktiv task|none yet" CURRENT_TASK.md; then
    return
  fi

  if grep -qiE "jira id|^# CURRENT_TASK:|status:" CURRENT_TASK.md; then
    report_warn "CURRENT_TASK.md has active task" \
      "The task memory file appears to contain an active task." \
      "Run /finish-task or reset CURRENT_TASK.md before /start-task."
  fi
}

main() {
  print_header
  echo ""

  check_git_clean
  check_branch
  check_jira
  check_github_auth
  check_environment

  print_footer

  if [[ "$fail_count" -gt 0 ]]; then
    exit 1
  fi
  exit 0
}

main "$@"
