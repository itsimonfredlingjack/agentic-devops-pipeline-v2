#!/usr/bin/env python3
"""Parse Jules review findings and create standalone Jira tickets.

One-way async push: Jules → Jira. No AI-to-AI conversation.
Jira acts as firewall — Claude picks up tickets via normal Ralph Loop
without knowing Jules created them.

KEY DESIGN: Tickets are standalone Tasks, NOT sub-tasks. This avoids
the race condition where parent ticket is already Done when Jules
finishes its async review. The origin PR/ticket is referenced in
the description only.

Uses only stdlib + local jira_client. No pip install needed in CI.

Environment variables:
    JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN — Jira credentials
    HEAD_REF — Branch name (e.g., feature/GE-35-description)
    JULES_REVIEW_BODY — Full Jules review comment body (from previous step)
    PR_NUMBER — PR number for logging
"""

from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

# Allow importing jira_client from src/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.sejfa.integrations.jira_client import (
    JiraAPIError,
    JiraClient,
    JiraConfig,
)

MAX_TASKS = 3
# Patterns tried in order — first match wins per line
SEVERITY_PATTERNS: list[re.Pattern[str]] = [
    # Original: [SEVERITY] file:line — description
    re.compile(
        r"\[(?P<severity>HIGH|MEDIUM|LOW|CRITICAL)\]\s+"
        r"(?P<location>\S+)"
        r"\s*[—–\-:]\s*"
        r"(?P<description>.+)",
        re.IGNORECASE,
    ),
    # Markdown bold: **SEVERITY** file:line — description
    re.compile(
        r"\*\*(?P<severity>HIGH|MEDIUM|LOW|CRITICAL)\*\*\s+"
        r"(?P<location>\S+)"
        r"\s*[—–\-:]\s*"
        r"(?P<description>.+)",
        re.IGNORECASE,
    ),
    # Colon-separated: SEVERITY: file:line — description
    re.compile(
        r"(?P<severity>HIGH|MEDIUM|LOW|CRITICAL):\s+"
        r"(?P<location>\S+)"
        r"\s*[—–\-:]\s*"
        r"(?P<description>.+)",
        re.IGNORECASE,
    ),
    # Numbered/bulleted: N. [SEVERITY] or - [SEVERITY] or * [SEVERITY]
    re.compile(
        r"(?:\d+\.\s*|[-*]\s+)"
        r"\[?(?P<severity>HIGH|MEDIUM|LOW|CRITICAL)\]?\s+"
        r"(?P<location>\S+)"
        r"\s*[—–\-:]\s*"
        r"(?P<description>.+)",
        re.IGNORECASE,
    ),
    # Loose: SEVERITY then file-like path, then description
    re.compile(
        r"(?P<severity>HIGH|MEDIUM|LOW|CRITICAL)\s*[:\]}\s]+\s*"
        r"(?P<location>[\w./]+(?::\d+)?)"
        r"\s*[—–\-:]\s*"
        r"(?P<description>.+)",
        re.IGNORECASE,
    ),
]
TICKET_KEY_PATTERN = re.compile(r"([A-Z]+-\d+)")

# Indicators that review_body is an error/timeout, not actual findings
_ERROR_INDICATORS = (
    "\u23f1\ufe0f",  # ⏱️ timer emoji (timeout)
    "\u26a0\ufe0f",  # ⚠️ warning emoji (API error)
    "\u274c",  # ❌ cross emoji (session failed)
    "timed out",
    "Session timed out",
    "Failed to create",
    "Session failed",
    "API returned unexpected",
    "Manual review recommended",
)


@dataclass
class Finding:
    """A single parsed Jules review finding."""

    severity: str
    location: str
    description: str

    @property
    def summary(self) -> str:
        """Generate Jira-friendly summary (max 255 chars)."""
        return f"[Jules/{self.severity}] {self.location}: {self.description}"[:255]

    def body(self, origin_key: str | None = None, pr_number: str = "") -> str:
        """Generate description body for Jira ticket."""
        lines = [
            f"Severity: {self.severity}",
            f"Location: {self.location}",
            f"Description: {self.description}",
            "",
            "Source: Automated Jules code review",
        ]
        if origin_key or pr_number:
            lines.append("")
            lines.append("Origin:")
            if origin_key:
                lines.append(f"  Ticket: {origin_key}")
            if pr_number:
                lines.append(f"  PR: #{pr_number}")
        return "\n".join(lines)


def _log(msg: str, level: str = "notice") -> None:
    print(f"::{level}::{msg}" if level != "notice" else msg, flush=True)


def _is_error_or_timeout(text: str) -> bool:
    """Check if review body is an error/timeout message, not findings.

    Checks only the first 5 lines to avoid false positives from
    findings that happen to contain words like "failed".
    """
    first_lines = "\n".join(text.splitlines()[:5])
    return any(indicator in first_lines for indicator in _ERROR_INDICATORS)


def _strip_review_wrapper(text: str) -> str:
    """Strip format_review_body() header/footer wrapper if present.

    The review_body from jules_review_api.py is wrapped with:
        ## 🔍 Jules Code Review\\n\\n{content}\\n\\n---\\n*footer*
    This function extracts just the content portion.
    """
    if "Jules Code Review" not in text:
        return text

    lines = text.splitlines()
    content_lines: list[str] = []
    in_content = False

    for line in lines:
        if line.startswith("## ") and "Jules Code Review" in line:
            in_content = True
            continue
        if in_content and line.startswith("---"):
            break
        if in_content:
            content_lines.append(line)

    stripped = "\n".join(content_lines).strip()
    return stripped if stripped else text


def _try_parse_json_findings(review_body: str) -> list[Finding]:
    """Attempt to extract findings from raw JSON in the review body.

    Handles the case where extract_review_text() fell through to its
    raw JSON fallback strategy (wrapped in a markdown code block).
    Also handles the format_review_body() wrapper.
    """
    findings: list[Finding] = []
    severity_words = {"HIGH", "MEDIUM", "LOW", "CRITICAL"}

    # Strip review wrapper first
    text = _strip_review_wrapper(review_body)

    # Strip "Raw session data:" prefix if present
    if "Raw session data:" in text:
        text = text.split("Raw session data:", 1)[1]

    # Strip markdown code fences if present
    if "```json" in text:
        text = text.split("```json", 1)[1]
        if "```" in text:
            text = text.rsplit("```", 1)[0]
    elif "```" in text:
        # Fenced but without json language tag
        parts = text.split("```")
        if len(parts) >= 3:
            text = parts[1]

    try:
        data = json.loads(text.strip())
    except (json.JSONDecodeError, ValueError):
        return findings

    def _walk(obj: object) -> None:
        if isinstance(obj, dict):
            sev = ""
            loc = ""
            desc = ""
            for key, val in obj.items():
                key_lower = key.lower()
                if key_lower == "severity" and isinstance(val, str):
                    sev = val.upper()
                elif key_lower in (
                    "location",
                    "file",
                    "path",
                    "filename",
                    "file_path",
                    "filepath",
                ) and isinstance(val, str):
                    loc = val
                elif key_lower in (
                    "description",
                    "message",
                    "detail",
                    "finding",
                    "text",
                    "content",
                    "summary",
                ) and isinstance(val, str):
                    desc = val
                elif isinstance(val, (dict, list)):
                    _walk(val)
            if sev in severity_words and desc:
                findings.append(
                    Finding(
                        severity=sev,
                        location=loc or "unknown",
                        description=desc,
                    )
                )
        elif isinstance(obj, list):
            for item in obj:
                _walk(item)

    _walk(data)
    return findings


def parse_findings(review_body: str) -> list[Finding]:
    """Extract structured findings from Jules review text.

    Tries multiple formats in order:
    1. Line-based regex patterns (original + markdown/numbered/loose)
    2. JSON-structured fallback for raw API responses
    """
    findings: list[Finding] = []
    seen: set[str] = set()

    for line in review_body.splitlines():
        line = line.strip()
        if not line:
            continue

        for pattern in SEVERITY_PATTERNS:
            match = pattern.search(line)
            if match:
                key = match.group("severity").upper() + "|" + match.group("location").strip()
                if key not in seen:
                    seen.add(key)
                    findings.append(
                        Finding(
                            severity=match.group("severity").upper(),
                            location=match.group("location").strip(),
                            description=match.group("description").strip(),
                        )
                    )
                break  # First pattern match wins for this line

    # Fallback: try JSON parsing if no line-based findings
    if not findings:
        _log("No line-based findings, trying JSON fallback parser")
        findings = _try_parse_json_findings(review_body)

    return findings


def extract_parent_key(head_ref: str) -> str | None:
    """Extract Jira ticket key from branch name.

    Examples:
        feature/GE-35-add-auth -> GE-35
        fix/GE-102-bug -> GE-102
        GE-50-description -> GE-50
    """
    match = TICKET_KEY_PATTERN.search(head_ref)
    return match.group(1) if match else None


def extract_project_key(parent_key: str) -> str:
    """Extract project key from issue key. GE-35 -> GE."""
    return parent_key.split("-")[0]


def create_tasks(
    client: JiraClient,
    origin_key: str,
    findings: list[Finding],
    pr_number: str = "",
) -> list[str]:
    """Create standalone Jira Tasks for HIGH/MEDIUM+ severity findings.

    Standalone Tasks (not Sub-tasks) avoid the race condition where
    the parent ticket is already Done when Jules finishes its async
    review. The origin ticket is referenced in the description only.
    """
    project_key = extract_project_key(origin_key)
    actionable = ("HIGH", "CRITICAL", "MEDIUM")
    high_findings = [f for f in findings if f.severity in actionable]

    if not high_findings:
        _log("No HIGH/CRITICAL/MEDIUM findings — skipping task creation")
        return []

    to_create = high_findings[:MAX_TASKS]
    if len(high_findings) > MAX_TASKS:
        _log(f"Found {len(high_findings)} actionable findings, capping at {MAX_TASKS} tasks")

    created_keys: list[str] = []

    for finding in to_create:
        try:
            issue = client.create_issue(
                project_key=project_key,
                summary=finding.summary,
                description=finding.body(origin_key, pr_number),
                issue_type="Task",
                labels=["jules-review", "automated"],
            )
            created_keys.append(issue.key)
            _log(f"Created {issue.key}: {finding.summary[:80]}")
        except JiraAPIError as exc:
            _log(f"Failed to create task: {exc}", "warning")

    return created_keys


def add_low_findings_as_comment(
    client: JiraClient,
    parent_key: str,
    findings: list[Finding],
) -> bool:
    """Add LOW findings as a comment on the parent ticket.

    MEDIUM+ findings are now escalated to standalone Tasks.
    Only LOW severity stays as comments.
    """
    low_findings = [f for f in findings if f.severity == "LOW"]

    if not low_findings:
        return False

    lines = ["Jules review — lower-severity findings:\n"]
    for f in low_findings:
        lines.append(f"\u2022 [{f.severity}] {f.location} \u2014 {f.description}")

    try:
        client.add_comment(parent_key, "\n".join(lines))
        _log(f"Added {len(low_findings)} LOW findings as comment on {parent_key}")
        return True
    except JiraAPIError as exc:
        _log(f"Failed to add comment: {exc}", "warning")
        return False


def main() -> int:
    head_ref = os.environ.get("HEAD_REF", "").strip()
    review_body = os.environ.get("JULES_REVIEW_BODY", "").strip()
    pr_number = os.environ.get("PR_NUMBER", "")

    if not review_body:
        _log("JULES_REVIEW_BODY is empty — nothing to process")
        return 0

    # Early exit: detect timeout/error messages from jules_review_api.py
    if _is_error_or_timeout(review_body):
        _log("Review body is a timeout/error message, not findings — skipping Jira processing")
        _log(f"First 200 chars: {review_body[:200]}")
        return 0

    parent_key = extract_parent_key(head_ref)
    if not parent_key:
        _log(
            f"Could not extract ticket key from branch '{head_ref}'. "
            "Expected format: feature/GE-XXX-description"
        )
        return 0

    _log(f"Processing Jules findings for {parent_key} (PR #{pr_number})")

    # Parse findings
    findings = parse_findings(review_body)
    if not findings:
        _log("No structured findings found in Jules review")
        _log(f"Review body length: {len(review_body)} chars")
        _log(f"First 300 chars: {review_body[:300]}")
        return 0

    task_count = sum(1 for f in findings if f.severity in ("HIGH", "CRITICAL", "MEDIUM"))
    low_count = sum(1 for f in findings if f.severity == "LOW")
    _log(
        f"Found {len(findings)} findings: "
        f"{task_count} HIGH/CRITICAL/MEDIUM (\u2192 tasks), "
        f"{low_count} LOW (\u2192 comment)"
    )

    # Initialize Jira client
    try:
        config = JiraConfig.from_env()
        client = JiraClient(config)
    except ValueError as exc:
        _log(f"Jira config error: {exc}", "error")
        return 1

    # Create standalone tasks for HIGH severity
    created = create_tasks(client, parent_key, findings, pr_number)
    if created:
        _log(f"Created {len(created)} tasks: {', '.join(created)}")

    # Add LOW findings as comment (MEDIUM+ escalated to tasks above)
    add_low_findings_as_comment(client, parent_key, findings)

    # Write output for downstream steps
    github_output = os.environ.get("GITHUB_OUTPUT", "")
    if github_output:
        with open(github_output, "a") as f:
            f.write(f"tasks_created={len(created)}\n")
            f.write(f"task_keys={','.join(created)}\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
