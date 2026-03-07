#!/bin/bash
# Create a properly named branch for a Jira ticket
# Usage: ./create-branch.sh <JIRA-ID> <branch-type> <description>
# Example: ./create-branch.sh PROJ-123 feature "add user authentication"

set -e

JIRA_ID="${1:?Error: JIRA_ID required (e.g., PROJ-123)}"
BRANCH_TYPE="${2:-feature}"
DESCRIPTION="${3:-implementation}"

# Validate JIRA ID format
if ! [[ "$JIRA_ID" =~ ^[A-Z]+-[0-9]+$ ]]; then
    echo "Error: JIRA_ID must match format PROJECT-123 (e.g., PROJ-123)"
    exit 1
fi

# Validate branch type
case "$BRANCH_TYPE" in
    feature|bugfix|hotfix|refactor|docs)
        ;;
    *)
        echo "Error: branch-type must be one of: feature, bugfix, hotfix, refactor, docs"
        exit 1
        ;;
esac

# Create slug from description
SLUG=$(echo "$DESCRIPTION" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | cut -c1-50)

# Full branch name
BRANCH_NAME="${BRANCH_TYPE}/${JIRA_ID}-${SLUG}"

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "Error: You have uncommitted changes. Please commit or stash them first."
    exit 1
fi

# Get default branch
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")

# Update and create branch
echo "Creating branch: $BRANCH_NAME"
git fetch origin
git checkout "$DEFAULT_BRANCH"
git pull origin "$DEFAULT_BRANCH"
git checkout -b "$BRANCH_NAME"

echo ""
echo "✅ Branch created: $BRANCH_NAME"
echo "   Based on: $DEFAULT_BRANCH"
echo ""
echo "Next steps:"
echo "  1. Make your changes"
echo "  2. Commit with: git commit -m \"$JIRA_ID: <description>\""
echo "  3. Push with: git push -u origin $BRANCH_NAME"
