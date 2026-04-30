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

  if grep -qiE "task ref|^# CURRENT_TASK:|status:" CURRENT_TASK.md; then
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
  check_github_auth
  check_environment

  print_footer

  if [[ "$fail_count" -gt 0 ]]; then
    exit 1
  fi
  exit 0
}

main "$@"
