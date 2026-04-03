# /finish-task — Clean up after Ralph Loop

Clean up the workspace after a completed or aborted Ralph Loop execution.

**Ticket key (optional):** $ARGUMENTS

## Steps

1. Read `CURRENT_TASK.md` to identify the active task (if $ARGUMENTS is empty).

2. If a ticket key is available, transition it to "Done" (or the appropriate done state):
   ```bash
   python3 -c "
   from src.sejfa.integrations.jira_client import get_jira_client
   client = get_jira_client()
   client.transition_issue('<TICKET_KEY>', 'Done')
   "
   ```
   If the transition fails, log and continue.

3. Reset `CURRENT_TASK.md`:
   ```markdown
   # CURRENT TASK

   No active task.
   ```

4. If on a feature branch and there are no uncommitted changes, switch back to main:
   ```bash
   git checkout main
   git pull origin main
   ```

5. Report completion:
   ```
   Task cleanup complete. Workspace ready for next task.
   ```
