# Jules AI Integration

> Archive status: workflow reference with historical and planned details.
> The root repo does not currently contain the GitHub Actions workflows described below, so this document must be read as reference material rather than current implementation truth.
> SEJFA remains a loop-first system; Jules is a review and feedback capability around that loop.

> Google Jules integration for automated code review and self-healing CI.

## Overview

This repository uses the [Google Jules API](https://developers.google.com/jules/api) in two GitHub Actions workflows:

| Workflow | File | Trigger | Purpose |
|----------|------|---------|----------|
| **Jules Code Review** | `.github/workflows/jules-review.yml` | PR opened/synchronized | AI code review on every PR |
| **Self-Healing Pipeline** | `.github/workflows/self-healing.yml` | CI failure (`workflow_run`) | Auto-fix CI failures via Jules |

```
PR opened → CI runs → ┬─ CI passes → done
                       └─ CI fails  → Self-Healing Pipeline
                                      ├─ Parse error logs
                                      ├─ Create Jules session
                                      ├─ Jules creates fix PR
                                      └─ Post status comment
                                      (max 3 attempts, then escalate)
```

---

## Setup

### 1. Jules API Key

1. Get an API key from [Google AI Studio](https://aistudio.google.com/) or the Jules developer console
2. Add it as a repository secret:
   - Go to **Settings → Secrets and variables → Actions**
   - Create secret: `JULES_API_KEY`

### 2. Jules GitHub App

The Jules GitHub App must be installed on the repository for Jules to access the code:

1. Visit [jules.google](https://jules.google/)
2. Connect your GitHub account
3. Grant access to this repository

### 3. Verify

Test the API key manually:

```bash
curl -s -X POST \
  "https://jules.googleapis.com/v1alpha/sessions" \
  -H "X-Goog-Api-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "List files in the repository root.",
    "sourceContext": {
      "source": "sources/github/OWNER/REPO",
      "githubRepoContext": { "startingBranch": "main" }
    },
    "title": "Test connectivity",
    "requirePlanApproval": false
  }'
```

Expected: JSON response with `name`, `id`, and `url` fields.

---

## API Reference

### Endpoint

```
POST https://jules.googleapis.com/v1alpha/sessions
```

### Authentication

```
X-Goog-Api-Key: <your-api-key>
```

### Source Format

**CRITICAL:** The `source` field must use the format:

```
sources/github/{owner}/{repo}
```

Example:
```
sources/github/itsimonfredlingjack/agentic-dev-loop-w-claude-code-and-github-actions
```

**Common mistake:** Using `sources/{owner}/{repo}` (missing `github/`) returns a 404 NOT_FOUND error.

### Request Body

```json
{
  "prompt": "Description of what Jules should do",
  "sourceContext": {
    "source": "sources/github/{owner}/{repo}",
    "githubRepoContext": {
      "startingBranch": "branch-name"
    }
  },
  "title": "Session title",
  "automationMode": "AUTO_CREATE_PR",
  "requirePlanApproval": false
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `prompt` | Yes | Instructions for Jules |
| `sourceContext.source` | Yes | `sources/github/{owner}/{repo}` |
| `sourceContext.githubRepoContext.startingBranch` | Yes | Branch to work on |
| `title` | No | Human-readable session title |
| `automationMode` | No | `AUTO_CREATE_PR` to auto-create fix PRs |
| `requirePlanApproval` | No | `false` for fully automated mode |

### Response

```json
{
  "name": "sessions/1234567890",
  "id": "1234567890",
  "url": "https://jules.google.com/session/1234567890",
  "title": "...",
  "sourceContext": { ... },
  "prompt": "..."
}
```

### Polling Session Status

```
GET https://jules.googleapis.com/v1alpha/sessions/{session_id}
```

States: `RUNNING`, `COMPLETED`, `FAILED`

### Getting Activities

```
GET https://jules.googleapis.com/v1alpha/sessions/{session_id}/activities
```

---

## Workflow Details

### Jules Code Review (`jules-review.yml`)

Triggered on every PR to `main` or `develop`.

**Flow:**
1. Checkout code
2. Create Jules session with code review prompt
3. Poll for completion (max 5 min)
4. Fetch activities (review findings)
5. Post summary comment on PR
6. If review fails → `jules-auto-fix` job triggers Jules to fix critical issues

### Self-Healing Pipeline (`self-healing.yml`)

Triggered when the CI workflow completes with `failure`.

**Flow:**
1. **Get branch info** — Extracts PR number and branch from `workflow_run.pull_requests[0]`
2. **Check attempts** — Counts `[jules-fix]`/`[self-healing]` commits (max 3)
3. **Parse CI logs** — Downloads failed job logs, extracts error context with regex
4. **Trigger Jules** — Sends error context + fix instructions to Jules API
5. **Wait** — Polls session status (max 10 min)
6. **Comment** — Posts status update on the PR
7. **Escalate** — If 3 attempts exhausted, creates GitHub issue and labels `ci-failure`, `needs-attention`

**PR Detection Logic:**
- Primary: `workflow_run.pull_requests[0].head.ref` and `.number`
- Fallback: `pulls.list()` filtered by `head: {owner}:{branch}` and `state: open`
- This ensures status comments reach the correct PR even when `workflow_run.pull_requests` is empty

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `404 NOT_FOUND` on session create | Wrong `source` format | Use `sources/github/{owner}/{repo}` (not `sources/{owner}/{repo}`) |
| `403 PERMISSION_DENIED` | API key invalid or repo not connected | Check `JULES_API_KEY` secret; connect repo at jules.google |
| Self-healing skipped | CI didn't fail, or no PR associated | Check `workflow_run.conclusion` and `pull_requests` array |
| No comment on PR | PR number not detected | Check `analyze-failure` job logs for branch/PR output |
| Jules session FAILED | Code too complex or timeout | Check session at jules.google for details |
| Self-healing keeps retrying | Jules fixes don't resolve CI | After 3 attempts, escalation issue is created automatically |
| `head_branch` resolves to `main` | GitHub Actions `workflow_run` quirk | Fixed: now uses `pull_requests[0].head.ref` instead |

---

## Secrets Required

| Secret | Where | Purpose |
|--------|-------|---------|
| `JULES_API_KEY` | Repository Settings → Secrets → Actions | Jules API authentication |

---

## Fixes Applied (January 2026)

### 1. Source Path Format (PR merged previously)

**Bug:** `sourceContext.source` used `sources/{repo}` — Jules API requires `sources/github/{repo}`.

**Fix:** Changed to `sources/github/${{ github.repository }}` in both workflow files.

**Files:** `.github/workflows/self-healing.yml`, `.github/workflows/jules-review.yml`

### 2. Self-Healing PR Detection (PR #19, merged)

**Bug:** `get-branch` step filtered `workflow_run.pull_requests` by SHA match and gated on `has_pr`. This caused:
- Silent self-healing skip when SHA didn't match (race condition with fast pushes)
- Wrong branch targeting (`head_branch` resolves to `main` for PR-triggered CI)

**Fix:**
- Use `pullRequests[0]` directly (array is already scoped to the run)
- Remove `has_pr` gate
- Add fallback `pulls.list()` by branch name for comment/escalation steps
- Pass `pr_number` as job output

**File:** `.github/workflows/self-healing.yml`

### 3. Smoke Test Verification (PR #20, closed)

End-to-end verification: intentional lint failure → CI fail → self-healing triggers → Jules receives session. Confirmed working.

---

## Links

- [Jules API Docs](https://developers.google.com/jules/api)
- [Jules Web App](https://jules.google/)
- [Google AI Studio](https://aistudio.google.com/)
