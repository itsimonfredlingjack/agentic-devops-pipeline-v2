# Jules playbook

> Archive status: historical workflow playbook.
> The workflow files named below are not present in the root repo today. Keep this document only as reference context for Jules-related automation ideas and past setups.

This guide explains how Jules runs in this repository, how you read workflow
outputs, and how you handle common failures. Use it during PR review,
self-healing incidents, and daily health checks.

## Workflow map

The repository uses three workflows so each automation concern stays focused.
`jules_review.yml` handles PR feedback, `self_healing.yml` handles failed CI
runs, and `jules_health_check.yml` validates integration health on schedule.

- **PR review:** `.github/workflows/jules_review.yml`
- **Self-healing:** `.github/workflows/self_healing.yml`
- **Health check:** `.github/workflows/jules_health_check.yml`
- **Branch CI (feeds self-healing):** `.github/workflows/ci_branch.yml`

## Payload and guardrails

All Jules prompts use `scripts/jules_payload.py` and one compact
`JULES_CONTEXT` object. This keeps payloads short, deterministic, and safe.

- Uses profile budgets: `QUICK_REVIEW`, `HEALING_FIX`, `DEEP_REVIEW`
- Sends top changed files and largest hunks first
- Sends latest relevant log lines, not full logs
- Masks secret-like values and auth headers
- Excludes `vendor/`, `.venv/`, `node_modules/`, and binary assets

## Failure taxonomy

`self_healing.yml` classifies failures using `scripts/classify_failure.py`.
Use taxonomy first, then inspect logs.

- `AUTH`, `RATE_LIMIT`, `NETWORK`, `TIMEOUT`
- `CONFIG`, `PERMISSION`
- `TEST_FAIL`, `LINT_FAIL`, `TYPE_FAIL`, `BUILD_FAIL`
- `FLAKY`, `UNKNOWN`

## Metrics and artifacts

Every Jules workflow uploads `artifacts/jules_metrics.json` so runtime behavior
is observable across runs.

- Key fields: workflow, run id, SHA, duration, retries, payload sizes
- Includes Jules session id when available
- Includes `fix_outcome` and classification data for self-healing runs
- Step Summary links back to failing CI run and current run

## Operations checklist

Use this sequence when you investigate Jules behavior.

1. Open the workflow run and read **Step Summary**.
2. Download the metrics artifact and confirm taxonomy and payload sizes.
3. Check cooldown and guardrail outcomes for self-healing runs.
4. If needed, rerun manually with `workflow_dispatch` (health check mode `full`).
5. If failures repeat, open or update the tracking issue with run links.

## Next steps

Keep this playbook in sync with workflow changes. Update it whenever taxonomy,
payload schema, or guardrail behavior changes.
