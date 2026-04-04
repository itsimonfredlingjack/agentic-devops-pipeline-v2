# SEJFA Testing & Verification Guide

After the 4-phase roadmap implementation (CI/CD, Loop Engine, Desktop Live, Hetzner Deploy), this guide covers everything you should test — from quick smoke tests to full end-to-end validation.

## Prerequisites

Before testing, ensure:

```bash
# Environment configured
cp .env.example .env   # Fill in Jira credentials, Ollama/Whisper URLs

# Python deps installed
pip install -e ".[dev]"

# Node deps installed
npm ci

# Verify baseline
bash scripts/ci_check.sh          # 273 tests, 68% coverage
npm run test                       # 30 desktop tests
```

---

## 1. CI/CD Pipeline (Fas 1)

### What to verify

| Test | How | Expected |
|------|-----|----------|
| CI triggers on push | Push to main, check GitHub Actions | `CI` workflow runs |
| Python lint gate | Introduce a lint error in a PR | CI fails, classify comment posted |
| Coverage gate | Coverage stays above 65% | CI passes |
| TS build gate | Break a type in desktop/ | Desktop workflow catches it |
| Classify failure | CI failure → taxonomy comment on PR | `TEST_FAIL`, `LINT_FAIL`, etc. |

### Quick check

```bash
# Verify CI passed on latest push
gh run list --limit 1
gh run view <run-id>

# Manually trigger classify
pytest -q --tb=long 2>&1 | tee /tmp/test.log
python scripts/classify_failure.py --log-file /tmp/test.log
```

---

## 2. Ralph Loop Engine (Fas 2)

### 2A. `/start-task` command (the brain)

This is the most important test. It validates the entire autonomous execution cycle.

#### Smoke test with a trivial ticket

1. Create a simple Jira ticket:
   - **Summary:** "Add project version to health endpoint response"
   - **Description:** "The GET /health endpoint should include a `version` field from pyproject.toml."
   - **Acceptance criteria:** "Health endpoint returns `{status: ok, version: 0.2.0, timestamp: ...}`"

2. Note the ticket key (e.g., `DEV-99`).

3. Run the command manually:
   ```bash
   claude "/start-task DEV-99"
   ```

4. Watch for:
   - Preflight passes
   - Jira ticket fetched and CURRENT_TASK.md written
   - Branch created (`feature/DEV-99-...`)
   - Test written (RED)
   - Implementation written (GREEN)
   - CI check passes
   - PR created on GitHub
   - Jira transitioned to "In Review"
   - Exit signal: `<result>DONE</result>`

5. Verify on GitHub:
   ```bash
   gh pr list --state open
   ```

#### Edge cases to test

| Scenario | What to check |
|----------|---------------|
| **Ambiguous ticket** | Ticket with vague description → expect BLOCKED |
| **Failing CI** | Ticket that causes test failure → self-healing attempts (up to 3) |
| **Protected area** | Ticket asking to modify `.env` → should refuse |
| **Already on branch** | Run /start-task when not on main → preflight fails |
| **Dirty working tree** | Uncommitted changes → preflight fails |

### 2B. Python Loop Runner

#### Start the runner

```bash
# Start voice pipeline first (the runner polls it)
PYTHONPATH=services/voice-pipeline/src uvicorn voice_pipeline.main:app --port 8000 &

# Start the runner
bash services/loop-engine/scripts/loop-runner.sh
```

#### What to verify

| Test | How | Expected |
|------|-----|----------|
| **Polls queue** | Runner logs show polling | `[INFO] Loop runner started` |
| **Picks up ticket** | Queue a ticket via voice pipeline | `Picked up ticket: DEV-99` |
| **Backoff on failure** | Stop voice pipeline, watch runner | Backoff increases: 10s, 20s, 40s... |
| **DLQ after 3 failures** | Force 3 failures | `Moving DEV-99 to dead-letter queue` |
| **Graceful shutdown** | Ctrl+C the runner | `Loop runner stopped gracefully` |
| **Heartbeat** | Start monitor API, run a task | Heartbeat events in monitor |

#### Queue a ticket programmatically

```bash
# Add a ticket to the queue
curl -X POST http://localhost:8000/api/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{"text": "Add a comment to README explaining the project"}'

# Check queue
curl http://localhost:8000/api/loop/queue

# Check failed tickets
curl http://localhost:8000/api/loop/failed
```

### 2C. Dead-Letter Queue

```bash
# After a ticket fails 3 times, check DLQ
curl http://localhost:8000/api/loop/failed

# Retry a failed ticket
curl -X POST http://localhost:8000/api/loop/retry/DEV-99
```

---

## 3. Desktop Live Integration (Fas 3)

### Start the full stack

```bash
./scripts/start-sejfa-local.sh start
# or manually:
PYTHONPATH=services/voice-pipeline/src uvicorn voice_pipeline.main:app --port 8000 &
PYTHONPATH=services/monitor-api/src uvicorn monitor.api:app --port 8110 &
npm --workspace desktop run electron:dev
```

### What to verify

| Test | How | Expected |
|------|-----|----------|
| **Sidebar shows Jira issues** | Open desktop app | Real tickets from Jira (or mock fallback) |
| **CommandPalette (Cmd+K)** | Press Cmd+K | Tasks list from Jira |
| **Voice input** | Hold Ctrl+Shift+V, speak | Pipeline stages animate |
| **Intent review** | After voice → extraction | IntentReview shows editable fields |
| **Approve/Discard** | Click approve or discard | Ticket created / session cleared |
| **Monitor dashboard** | Switch to monitor view | Live events during loop execution |
| **Abort button** | Click ABORT MISSION | Session terminates |
| **Checkpoint** | Click CHECKPOINT | Checkpoint signal sent |
| **Tactical instruction** | Type instruction, click PIVOT | Instruction sent to monitor |
| **Connection status** | Stop voice backend | Connection status shows disconnected |

### Test the Jira proxy

```bash
# List issues
curl http://localhost:8000/api/jira/issues

# Get single issue
curl http://localhost:8000/api/jira/issue/DEV-42
```

### Test session controls

```bash
# Abort
curl -X POST http://localhost:8110/sessions/test-session/abort

# Instruction
curl -X POST http://localhost:8110/sessions/test-session/instructions \
  -H "Content-Type: application/json" \
  -d '{"message": "Focus on the error handling first"}'

# Checkpoint
curl -X POST http://localhost:8110/sessions/test-session/checkpoint

# Check signals (what the hook reads)
curl http://localhost:8110/sessions/test-session/signals
```

---

## 4. Hetzner Deployment (Fas 4)

### Local Docker test first

```bash
# Build images
docker compose -f docker-compose.prod.yml build

# Start locally (use localhost domain)
SEJFA_DOMAIN=localhost docker compose -f docker-compose.prod.yml up -d

# Check health
curl http://localhost/health
curl http://localhost/events?limit=1

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Stop
docker compose -f docker-compose.prod.yml down
```

### Deploy to Hetzner

```bash
# SSH to Hetzner first, clone repo, set up .env
ssh hetzner
cd /opt/sejfa
git pull
cp .env.example .env  # Edit with real credentials

# Set domain
export SEJFA_DOMAIN=sejfa.yourdomain.com

# Deploy
bash scripts/deploy-hetzner.sh deploy

# Status
bash scripts/deploy-hetzner.sh status

# Logs
bash scripts/deploy-hetzner.sh logs
```

### What to verify after deploy

| Test | How | Expected |
|------|-----|----------|
| **HTTPS works** | `curl https://sejfa.domain.com/health` | `{"status": "ok"}` |
| **Voice pipeline** | POST /api/pipeline/run via HTTPS | Ticket created |
| **Monitor API** | GET /events via HTTPS | Event list |
| **Loop runner on Mac** | Set `LOOP_RUNNER_BACKEND_URL=https://sejfa.domain.com` | Polls Hetzner |
| **Desktop connects** | Set `VITE_SEJFA_VOICE_URL` to Hetzner | Live data from Hetzner |
| **Whisper via ai-server2** | Voice input | Transcription works (Hetzner → ai-server2) |

---

## 5. Full End-to-End Test

The ultimate test: voice → Jira → autonomous loop → PR.

### Steps

1. **Start services** on Hetzner (or locally):
   ```bash
   ./scripts/start-sejfa-local.sh start
   ```

2. **Start loop runner** on Mac:
   ```bash
   bash services/loop-engine/scripts/loop-runner.sh
   ```

3. **Open desktop app**:
   ```bash
   npm --workspace desktop run electron:dev
   ```

4. **Speak a task** (hold Ctrl+Shift+V):
   > "Create a utility function that formats file sizes in human-readable format, like 1.5 MB or 200 KB"

5. **Watch the flow:**
   - OmniPrompt → recording → processing
   - IntentReview → shows extracted intent
   - Approve → Jira ticket created
   - Ticket appears in queue
   - Loop runner picks it up
   - MonitorDashboard shows live tool events
   - TerminalFeed shows execution progress
   - PR created on GitHub
   - Completion summary displayed

6. **Verify:**
   ```bash
   # PR exists
   gh pr list --state open

   # Jira ticket transitioned
   # Check in Jira UI or:
   curl http://localhost:8000/api/jira/issue/<TICKET_KEY>

   # Loop log exists
   cat data/loop-logs/<TICKET_KEY>.log
   ```

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Preflight fails "not on main" | On a feature branch | `git checkout main` |
| Preflight fails "Jira connection" | Missing .env credentials | Check JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN |
| Whisper timeout | ai-server2 overloaded | Check GPU usage: `ssh ai-server2 nvidia-smi` |
| Loop runner "claude not found" | Claude Code not installed | Install Claude Code CLI |
| Desktop shows mock data | Voice backend not running | Start voice pipeline on :8000 |
| Monitor dashboard empty | Monitor API not running | Start monitor on :8110 |
| Docker build fails | Missing services/ directory | Ensure `COPY services/ services/` in Dockerfile |
| Caddy cert error | Domain not pointed to Hetzner | Update DNS, or use `localhost` for local test |

---

## Test Priority Order

If you're short on time, test in this order:

1. **CI green on GitHub** — confirms baseline works
2. **`/start-task` with trivial ticket** — validates the loop brain
3. **Loop runner picks up and completes** — validates the execution flow
4. **Desktop shows live Jira data** — validates frontend integration
5. **Docker build succeeds locally** — validates deployment readiness
6. **Full e2e: voice → PR** — the grand finale
