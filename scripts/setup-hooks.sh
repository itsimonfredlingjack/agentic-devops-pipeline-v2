#!/bin/bash
# Setup script for git hooks
# Run this after cloning the repository to enable local validation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
HOOKS_DIR="$REPO_ROOT/.githooks"

echo "Setting up git hooks..."

# Configure git to use our hooks directory
git config core.hooksPath "$HOOKS_DIR"

# Make hooks executable
chmod +x "$HOOKS_DIR"/*

echo ""
echo "\u2705 Git hooks installed successfully!"
echo ""
echo "Enabled hooks:"
echo "  - pre-push: Validates branch naming convention"
echo "  - commit-msg: Validates commit message format"
echo ""
echo "Branch naming format: {type}/{TASK-REF}-{slug}"
echo "  Examples: feature/SEJ-123-user-auth, bugfix/SEJ-456-fix-bug"
echo ""
echo "Commit message format: {TASK-REF}: {description}"
echo "  Example: SEJ-123: Implements login endpoint"
echo ""
echo "To disable hooks temporarily, use: git commit --no-verify"
