#!/usr/bin/env python3
"""Call Jules API directly and post findings as GitHub PR review comment.

Replaces google-labs-code/jules-action to avoid unwanted PR creation.
Uses only stdlib — no pip install needed in CI.

API Reference: https://jules.google/docs/api/reference/sessions
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

JULES_API_BASE = "https://jules.googleapis.com/v1alpha"
POLL_INTERVAL_SEC = 15
MAX_POLL_SEC = 720  # 12 min (workflow timeout is 20 min)
REQUEST_TIMEOUT_SEC = 30
SEVERITY_RE = re.compile(
    r"(?:\[|\*\*)?(?:HIGH|MEDIUM|LOW|CRITICAL)(?:\]|\*\*)?(?:\s|[:\-\u2014]|$)",
    re.IGNORECASE | re.MULTILINE,
)
# Keys that contain the prompt/config, NOT findings — skip during deep search
_SKIP_KEYS = frozenset({"title", "prompt", "sourceContext", "automationMode"})
_SEVERITY_WORDS = frozenset({"HIGH", "MEDIUM", "LOW", "CRITICAL"})


def _log(msg: str, level: str = "notice") -> None:
    print(f"::{level}::{msg}" if level != "notice" else msg, flush=True)


def _set_output(name: str, value: str) -> None:
    """Write a step output to $GITHUB_OUTPUT (multiline-safe)."""
    path = os.environ.get("GITHUB_OUTPUT", "")
    if not path:
        return
    with open(path, "a") as f:
        delimiter = "EOF_REVIEW_BODY"
        f.write(f"{name}<<{delimiter}\n{value}\n{delimiter}\n")


def _jules_request(
    path: str,
    *,
    method: str = "GET",
    body: dict | None = None,
    api_key: str,
) -> dict:
    url = f"{JULES_API_BASE}{path}"
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    }
    data = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SEC) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as exc:
        resp_body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        _log(
            f"Jules API {method} {path} -> {exc.code}: {resp_body}",
            "error",
        )
        raise
    except urllib.error.URLError as exc:
        _log(f"Jules API connection failed: {exc.reason}", "error")
        raise


def derive_source_name(repo: str) -> str:
    """Derive Jules source name from GITHUB_REPOSITORY (owner/repo)."""
    owner, name = repo.split("/", 1)
    return f"sources/github/{owner}/{name}"


def list_sources(api_key: str) -> list[dict]:
    """List connected sources to verify availability."""
    resp = _jules_request("/sources", api_key=api_key)
    return resp.get("sources", [])


def create_session(
    api_key: str,
    prompt: str,
    source_name: str,
    branch: str,
) -> dict:
    """Create a Jules review session — NO automationMode = no PR creation."""
    return _jules_request(
        "/sessions",
        method="POST",
        body={
            "prompt": prompt,
            "sourceContext": {
                "source": source_name,
                "githubRepoContext": {
                    "startingBranch": branch,
                },
            },
            # automationMode intentionally omitted -> review only, no PR
        },
        api_key=api_key,
    )


def _normalize_session_path(session_name: str) -> str:
    name = session_name.strip()
    if name.startswith("/"):
        name = name[1:]
    if name.startswith("sessions/"):
        return name
    return f"sessions/{name}"


def list_activities(
    api_key: str,
    session_name: str,
    *,
    page_size: int = 100,
    max_pages: int = 10,
) -> list[dict]:
    """List activities for a Jules session.

    Jules often puts the agent's actual message content under:
      /sessions/{id}/activities -> activities[].agentMessaged.agentMessage
    """
    session_path = _normalize_session_path(session_name)
    all_activities: list[dict] = []
    page_token = ""

    for page in range(max_pages):
        params: dict[str, str] = {"pageSize": str(page_size)}
        if page_token:
            params["pageToken"] = page_token
        query = urllib.parse.urlencode(params)
        resp = _jules_request(
            f"/{session_path}/activities?{query}",
            api_key=api_key,
        )

        batch = resp.get("activities", [])
        if isinstance(batch, list):
            all_activities.extend([item for item in batch if isinstance(item, dict)])

        token = resp.get("nextPageToken", "")
        if not isinstance(token, str) or not token.strip():
            break

        page_token = token.strip()
        _log(f"Activities pagination: fetching page {page + 2}", "notice")

    return all_activities


def _collect_texts(obj: object, *, _depth: int = 0) -> list[str]:
    if _depth > 20:
        return []
    if isinstance(obj, str):
        return [obj]
    if isinstance(obj, dict):
        texts: list[str] = []
        for val in obj.values():
            texts.extend(_collect_texts(val, _depth=_depth + 1))
        return texts
    if isinstance(obj, list):
        texts = []
        for item in obj:
            texts.extend(_collect_texts(item, _depth=_depth + 1))
        return texts
    return []


def extract_agent_messages(activities: list[dict]) -> list[str]:
    """Extract agent message strings from session activities."""
    messages: list[str] = []

    for activity in activities:
        agent = activity.get("agentMessaged")
        if not isinstance(agent, dict):
            continue

        msg_obj = agent.get("agentMessage")
        if msg_obj is None:
            continue

        candidates: list[str] = []
        if isinstance(msg_obj, str):
            candidates = [msg_obj]
        elif isinstance(msg_obj, dict):
            for key in ("content", "text", "message", "body", "markdown"):
                val = msg_obj.get(key)
                if isinstance(val, str) and val.strip():
                    candidates = [val]
                    break
            if not candidates:
                candidates = _collect_texts(msg_obj)
        else:
            candidates = _collect_texts(msg_obj)

        for text in candidates:
            cleaned = text.strip()
            if cleaned:
                messages.append(cleaned)

    return messages


def _severity_count(text: str) -> int:
    return len(SEVERITY_RE.findall(text))


def select_best_agent_message(messages: list[str]) -> str | None:
    if not messages:
        return None

    severity_messages = [m for m in messages if SEVERITY_RE.search(m)]
    if severity_messages:
        return max(severity_messages, key=lambda m: (_severity_count(m), len(m)))

    return messages[-1]


def poll_session(api_key: str, session_name: str) -> dict | None:
    """Poll until session completes or timeout."""
    path = session_name if session_name.startswith("/") else f"/{session_name}"
    if not path.startswith("/sessions/"):
        path = f"/sessions/{session_name}"

    start = time.monotonic()
    last_state = ""
    while time.monotonic() - start < MAX_POLL_SEC:
        try:
            session = _jules_request(path, api_key=api_key)
        except Exception:
            time.sleep(POLL_INTERVAL_SEC)
            continue

        state = session.get("state", "UNKNOWN")
        elapsed = int(time.monotonic() - start)
        if state != last_state:
            _log(f"  Session state: {state} ({elapsed}s)")
            last_state = state

        if state.upper() in ("COMPLETED", "FAILED"):
            return session

        time.sleep(POLL_INTERVAL_SEC)

    _log("Jules session timed out", "warning")
    return None


def _deep_find_texts(
    obj: object,
    *,
    skip_keys: frozenset[str] = _SKIP_KEYS,
    pattern: re.Pattern[str] = SEVERITY_RE,
    _depth: int = 0,
) -> list[str]:
    """Recursively walk a JSON structure and collect strings matching *pattern*.

    Skips keys in *skip_keys* (prompt/title contain the instruction, not findings).
    Returns de-duplicated list of matching strings, longest first.
    """
    if _depth > 20:
        return []

    hits: list[str] = []

    if isinstance(obj, str):
        if pattern.search(obj):
            hits.append(obj.strip())
    elif isinstance(obj, dict):
        for key, val in obj.items():
            if key in skip_keys:
                continue
            hits.extend(
                _deep_find_texts(val, skip_keys=skip_keys, pattern=pattern, _depth=_depth + 1)
            )
    elif isinstance(obj, list):
        for item in obj:
            hits.extend(
                _deep_find_texts(item, skip_keys=skip_keys, pattern=pattern, _depth=_depth + 1)
            )

    # De-duplicate preserving order, longest first
    if _depth == 0:
        seen: set[str] = set()
        unique: list[str] = []
        for text in sorted(hits, key=len, reverse=True):
            if text not in seen:
                seen.add(text)
                unique.append(text)
        return unique

    return hits


_UNIFIED_DIFF_HEADER = "diff --git"
_DIFF_FINDING_RE = re.compile(
    r"^(?:\[|\*\*)?(HIGH|MEDIUM|LOW|CRITICAL)",
    re.IGNORECASE,
)
_MAX_DIFF_FINDINGS = 50


def _extract_added_lines_from_unified_diff(text: str) -> list[str]:
    stripped = text.lstrip()
    if not stripped.startswith(_UNIFIED_DIFF_HEADER):
        return []

    added: list[str] = []
    for line in stripped.splitlines():
        if not line.startswith("+") or line.startswith("+++"):
            continue
        content = line[1:].strip()
        if content:
            added.append(content)
    return added


def _extract_diff_findings(text: str) -> list[str]:
    added = _extract_added_lines_from_unified_diff(text)
    findings: list[str] = []
    for line in added:
        if _DIFF_FINDING_RE.match(line):
            findings.append(line)
        if len(findings) >= _MAX_DIFF_FINDINGS:
            break
    return findings


def _extract_structured_findings(
    obj: object,
    *,
    _depth: int = 0,
) -> list[str]:
    """Walk JSON tree and extract dicts that look like structured findings.

    Jules sometimes returns findings as structured objects:
        {"severity": "HIGH", "file": "foo.py", "description": "..."}
    rather than pre-formatted text strings.

    Returns formatted strings: [SEVERITY] location — description
    """
    if _depth > 20:
        return []

    results: list[str] = []

    if isinstance(obj, dict):
        sev = ""
        loc = ""
        desc = ""
        for key, val in obj.items():
            if not isinstance(val, str):
                continue
            key_lower = key.lower()
            if key_lower == "severity":
                sev = val.upper().strip()
            elif key_lower in (
                "location",
                "file",
                "path",
                "filename",
                "file_path",
                "filepath",
            ):
                loc = val.strip()
            elif key_lower in (
                "description",
                "message",
                "detail",
                "finding",
                "text",
                "content",
                "summary",
            ):
                desc = val.strip()

        if sev in _SEVERITY_WORDS and desc:
            loc = loc or "unknown"
            results.append(f"[{sev}] {loc} \u2014 {desc}")

        # Recurse into all values regardless
        for val in obj.values():
            if isinstance(val, (dict, list)):
                results.extend(_extract_structured_findings(val, _depth=_depth + 1))
    elif isinstance(obj, list):
        for item in obj:
            results.extend(_extract_structured_findings(item, _depth=_depth + 1))

    return results


def _log_session_structure(session: dict, max_depth: int = 3) -> None:
    """Log the JSON key structure of a session for debugging."""

    def _keys(obj: object, depth: int = 0) -> str:
        if depth >= max_depth:
            return "..."
        if isinstance(obj, dict):
            parts = []
            for k, v in obj.items():
                child = _keys(v, depth + 1)
                parts.append(f"{k}: {child}" if child else k)
            return "{" + ", ".join(parts[:10]) + "}"
        if isinstance(obj, list):
            if obj:
                return f"[{_keys(obj[0], depth + 1)} x{len(obj)}]"
            return "[]"
        if isinstance(obj, str):
            return f"str({len(obj)})"
        return type(obj).__name__

    _log(f"Session structure: {_keys(session)}")


def extract_review_text(session: dict) -> str:
    """Extract readable review text from completed session response.

    Strategy (in priority order):
    1.  Deep-search for strings containing [SEVERITY] markers
    1b. Extract structured finding objects (dicts with severity key)
    2.  Check known structured fields (outputs, plan, response, etc.)
    2b. Deep-search for ANY substantial text (no severity filter)
    3.  Fallback: short message (raw JSON only when JULES_DEBUG=1)
    """
    debug_enabled = os.environ.get("JULES_DEBUG", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    _log(f"Session response keys: {sorted(session.keys())}")
    _log_session_structure(session)
    parts: list[str] = []

    # --- Strategy 1: Deep recursive search for severity-tagged strings ---
    severity_texts = _deep_find_texts(session)
    if severity_texts:
        _log(f"Found {len(severity_texts)} text blocks with severity markers")
        non_diff = [t for t in severity_texts if not t.lstrip().startswith(_UNIFIED_DIFF_HEADER)]
        if non_diff:
            parts.extend(non_diff)
            return "\n\n".join(parts)

        diff_findings: list[str] = []
        for text in severity_texts:
            diff_findings.extend(_extract_diff_findings(text))
        if diff_findings:
            _log(f"Extracted {len(diff_findings)} findings from unified diff output")
            return "\n".join(diff_findings)

    # --- Strategy 1b: Extract structured finding objects ---
    structured = _extract_structured_findings(session)
    if structured:
        _log(f"Found {len(structured)} structured finding objects (dict with severity key)")
        return "\n\n".join(structured)

    # --- Strategy 2: Check known structured fields ---

    # Check outputs array (completed sessions have this)
    outputs = session.get("outputs", [])
    if isinstance(outputs, list):
        for output in outputs:
            if not isinstance(output, dict):
                continue
            change_set = output.get("changeSet")
            if isinstance(change_set, dict):
                diff_texts = _deep_find_texts(
                    change_set,
                    pattern=re.compile(r"^diff --git", re.MULTILINE),
                )
                findings: list[str] = []
                for diff_text in diff_texts:
                    findings.extend(_extract_diff_findings(diff_text))
                if findings:
                    _log(f"Extracted {len(findings)} findings from outputs[].changeSet")
                    return "\n".join(findings)
            pr_info = output.get("pullRequest", {})
            if isinstance(pr_info, dict) and pr_info:
                title = pr_info.get("title", "")
                desc = pr_info.get("description", "")
                url = pr_info.get("url", "")
                if title:
                    parts.append(f"**PR Title:** {title}")
                if desc:
                    parts.append(desc)
                if url:
                    parts.append(f"PR URL: {url}")

    # Check plan (sessions expose their plan)
    plan = session.get("plan", {})
    if isinstance(plan, dict):
        for key in ("description", "summary"):
            val = plan.get(key, "")
            if isinstance(val, str) and val.strip():
                parts.append(val.strip())
        steps = plan.get("steps", [])
        if isinstance(steps, list):
            step_texts: list[str] = []
            for item in steps:
                if isinstance(item, str) and item.strip():
                    step_texts.append(f"- {item.strip()}")
                elif isinstance(item, dict):
                    desc = item.get("description", item.get("content", ""))
                    if desc:
                        step_texts.append(f"- {str(desc).strip()}")
            if step_texts:
                parts.append("**Plan steps:**\n" + "\n".join(step_texts))

    # Check session-level text fields
    for key in ("response", "output", "result", "summary", "review"):
        val = session.get(key, "")
        if val and isinstance(val, str) and val.strip():
            parts.append(val.strip())

    # --- Strategy 2b: Deep-search for ANY substantial text ---
    if not parts:
        all_texts = _deep_find_texts(session, pattern=re.compile(r".{80,}", re.DOTALL))
        for text in all_texts:
            if text.lstrip().startswith(_UNIFIED_DIFF_HEADER):
                continue
            if "You are the automated PR reviewer" in text:
                continue
            if len(text) > 80:
                parts.append(text)
                break

    # --- Strategy 3: Raw JSON fallback ---
    if not parts:
        parts.append(
            "Jules session completed, but no findings/review text could be extracted "
            "from the session response."
        )
        if debug_enabled:
            raw = json.dumps(session, indent=2, ensure_ascii=False)
            if len(raw) > 15000:
                raw = raw[:15000] + "\n...(truncated)"
            parts.append(f"Debug raw session data:\n```json\n{raw}\n```")

    return "\n\n".join(parts)


def format_review_body(
    review_text: str,
    session_id: str,
    session_url: str = "",
) -> str:
    """Format the final PR review comment body."""
    header = "## \U0001f50d Jules Code Review\n\n"
    link = f"[View session]({session_url})" if session_url else ""
    footer = (
        f"\n\n---\n"
        f"*Automated review via Jules API (session: `{session_id}`)*"
        f"{'  | ' + link if link else ''}\n"
        f"*Mode: `api_direct_review_comment` \u2014 no PRs created*"
    )

    max_body = 60000
    body = review_text
    if len(body) > max_body:
        body = body[:max_body] + "\n\n...(truncated)"

    return header + body + footer


def post_review_comment(
    repo: str,
    pr_number: str,
    head_sha: str,
    body: str,
) -> bool:
    """Post a PR review comment via gh CLI."""
    payload = json.dumps(
        {
            "body": body,
            "event": "COMMENT",
            "commit_id": head_sha,
        }
    )

    result = subprocess.run(
        [
            "gh",
            "api",
            f"repos/{repo}/pulls/{pr_number}/reviews",
            "--method",
            "POST",
            "--input",
            "-",
        ],
        input=payload,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        _log(f"Failed to post review via gh api: {result.stderr}", "error")
        _log("Falling back to regular issue comment...")
        fallback = subprocess.run(
            [
                "gh",
                "api",
                f"repos/{repo}/issues/{pr_number}/comments",
                "--method",
                "POST",
                "-f",
                f"body={body}",
            ],
            capture_output=True,
            text=True,
        )
        if fallback.returncode != 0:
            _log(
                f"Fallback comment also failed: {fallback.stderr}",
                "error",
            )
            return False
        _log(f"Posted as regular comment on PR #{pr_number}")
        return True

    _log(f"Review comment posted on PR #{pr_number}")
    return True


def main() -> int:
    api_key = os.environ.get("JULES_API_KEY", "").strip()
    repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
    pr_number = os.environ.get("PR_NUMBER", "").strip()
    head_sha = os.environ.get("HEAD_SHA", "").strip()
    head_ref = os.environ.get("HEAD_REF", "main").strip()
    context = os.environ.get("JULES_CONTEXT", "").strip()

    if not api_key:
        _log("JULES_API_KEY not set", "error")
        return 1
    if not repo or not pr_number:
        _log("GITHUB_REPOSITORY or PR_NUMBER missing", "error")
        return 1

    # Derive source name from repo (owner/repo -> sources/github/owner/repo)
    source_name = derive_source_name(repo)
    _log(f"Derived source: {source_name}")

    # Verify source exists
    try:
        sources = list_sources(api_key)
        source_names = [s.get("name", "") for s in sources]
        if source_name not in source_names:
            _log(
                f"Source {source_name} not found in connected sources. Available: {source_names}",
                "warning",
            )
            if source_names:
                _log(
                    "Tip: Install the Jules GitHub App on your repo at https://jules.google",
                    "warning",
                )
    except Exception as exc:
        _log(
            f"Could not list sources ({exc}), proceeding with derived name",
            "warning",
        )

    # Build review prompt
    prompt = (
        "You are the automated PR reviewer for this repository.\n"
        "Review the code changes on the current branch and provide "
        "concise, actionable feedback.\n"
        "Prioritize: correctness > security > reliability > test coverage.\n"
        "Return at most 8 findings sorted by severity.\n"
        "Format each finding as: [SEVERITY] file:line \u2014 description\n"
        "Do NOT create a pull request or make any code changes.\n\n"
    )
    if context:
        prompt += f"PR CONTEXT:\n{context}"

    # Step 1: Create session
    _log(f"Creating Jules review session for {repo} PR #{pr_number}...")
    _log(f"  Source: {source_name}, Branch: {head_ref}")
    try:
        session = create_session(api_key, prompt, source_name, head_ref)
    except Exception as exc:
        body = (
            "\u26a0\ufe0f **Jules Review** \u2014 Failed to create review session.\n\n"
            f"Error: `{exc}`\n\n"
            "The Jules API may be temporarily unavailable. "
            "Manual review recommended."
        )
        if head_sha:
            post_review_comment(repo, pr_number, head_sha, body)
        _set_output("review_body", body)
        return 0

    # Extract session ID (API returns "name": "sessions/abc123")
    session_name = session.get("name", "")
    session_id = session_name.split("/")[-1] if session_name else session.get("id", "")
    session_url = session.get("url", "")

    if not session_id:
        _log(f"No session ID in response: {json.dumps(session)}", "error")
        body = (
            "\u26a0\ufe0f **Jules Review** \u2014 API returned unexpected response.\n\n"
            f"```json\n{json.dumps(session, indent=2)[:2000]}\n```"
        )
        if head_sha:
            post_review_comment(repo, pr_number, head_sha, body)
        _set_output("review_body", body)
        return 0

    _log(f"Session created: {session_id}")
    if session_url:
        _log(f"  Dashboard: {session_url}")

    # Step 2: Poll for completion
    _log("Polling for completion...")
    final_session = poll_session(api_key, session_name or session_id)

    if final_session is None:
        timeout_min = MAX_POLL_SEC // 60
        body = (
            "\u23f1\ufe0f **Jules Review** \u2014 "
            f"Session timed out after {timeout_min} minutes.\n\n"
            f"Session ID: `{session_id}`\n"
            "Manual review recommended."
        )
        if head_sha:
            post_review_comment(repo, pr_number, head_sha, body)
        _set_output("review_body", body)
        return 0

    state = final_session.get("state", "UNKNOWN").upper()
    _log(f"Session finished with state: {state}")

    if state == "FAILED":
        error_msg = final_session.get("error", final_session.get("message", "Unknown error"))
        body = (
            f"\u274c **Jules Review** \u2014 Session failed.\n\n"
            f"Error: `{error_msg}`\n"
            f"Session ID: `{session_id}`"
        )
        if head_sha:
            post_review_comment(repo, pr_number, head_sha, body)
        _set_output("review_body", body)
        return 1

    # Step 3: Extract findings from session response
    _log("Extracting review findings...")
    review_text = ""
    agent_messages: list[str] = []
    try:
        activities = list_activities(api_key, final_session.get("name", session_id))
        agent_messages = extract_agent_messages(activities)
        selected = select_best_agent_message(agent_messages)
        if selected:
            review_text = selected
        else:
            _log(
                "No agent messages found in session activities; falling back to "
                "session response parsing",
                "warning",
            )
    except Exception as exc:
        _log(f"Failed to fetch activities: {exc}", "warning")

    if not review_text.strip():
        review_text = extract_review_text(final_session)
        if (
            not agent_messages
            and "no findings/review text could be extracted" in review_text.lower()
        ):
            review_text = (
                "Jules session completed, but no agent message was found in "
                "`activities` and no findings could be extracted from the session."
            )
    review_body = format_review_body(review_text, session_id, session_url)

    if not head_sha:
        _log("No HEAD_SHA \u2014 printing review to stdout only")
        print(review_body)
        _set_output("review_body", review_body)
        return 0

    success = post_review_comment(repo, pr_number, head_sha, review_body)
    _set_output("review_body", review_body)
    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())
