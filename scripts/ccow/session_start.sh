#!/usr/bin/env bash
set -euo pipefail

# Only run in remote/web environment (otherwise it's slow locally)
if [ "${CLAUDE_CODE_REMOTE:-false}" != "true" ]; then
  exit 0
fi

echo "[ccow] SessionStart: installing deps (remote) ..."

# 1) Node deps (select package manager based on lockfile)
if [ -f "pnpm-lock.yaml" ]; then
  corepack enable >/dev/null 2>&1 || true
  pnpm install --frozen-lockfile
elif [ -f "yarn.lock" ]; then
  corepack enable >/dev/null 2>&1 || true
  yarn install --frozen-lockfile
elif [ -f "package-lock.json" ]; then
  npm ci
elif [ -f "bun.lockb" ]; then
  bun install --frozen-lockfile
fi

# 2) Python deps
if [ -f "poetry.lock" ] || [ -f "pyproject.toml" ]; then
  if command -v poetry >/dev/null 2>&1; then
    poetry install --no-interaction --no-ansi
  fi
elif [ -f "requirements.txt" ]; then
  pip install -r requirements.txt
fi

# 3) Persist PATH so Claude can run local CLIs (eslint, vitest, etc)
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PATH="$PATH:./node_modules/.bin"' >> "$CLAUDE_ENV_FILE"
fi

echo "[ccow] SessionStart: done."
exit 0
