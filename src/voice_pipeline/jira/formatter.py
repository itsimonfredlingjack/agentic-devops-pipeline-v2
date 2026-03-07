"""Atlassian Document Format (ADF) helpers for rich Jira ticket descriptions.

ADF is the JSON format used by Jira Cloud REST API v3 for structured content.
"""

from typing import Any


def _paragraph(text: str) -> dict[str, Any]:
    """Create an ADF paragraph node."""
    return {
        "type": "paragraph",
        "content": [{"type": "text", "text": text}],
    }


def _heading(text: str, level: int = 2) -> dict[str, Any]:
    """Create an ADF heading node."""
    return {
        "type": "heading",
        "attrs": {"level": level},
        "content": [{"type": "text", "text": text}],
    }


def _code_block(text: str, language: str = "gherkin") -> dict[str, Any]:
    """Create an ADF code block node."""
    return {
        "type": "codeBlock",
        "attrs": {"language": language},
        "content": [{"type": "text", "text": text}],
    }


def _rule() -> dict[str, Any]:
    """Create an ADF horizontal rule node."""
    return {"type": "rule"}


def build_adf_description(
    description: str,
    acceptance_criteria: str,
    voice_initiated: bool = True,
) -> dict[str, Any]:
    """Build a rich ADF document for a Jira ticket description.

    Sections:
      - Description paragraph
      - Acceptance Criteria heading + Gherkin code block
      - (Optional) voice-initiated notice

    Args:
        description: Plain-text ticket description.
        acceptance_criteria: Gherkin acceptance criteria text.
        voice_initiated: Whether to append the VOICE_INITIATED notice.

    Returns:
        ADF document dict ready to send to Jira REST API v3.
    """
    content: list[dict[str, Any]] = []

    if description:
        content.append(_paragraph(description))

    if acceptance_criteria:
        content.append(_heading("Acceptance Criteria", level=2))
        content.append(_code_block(acceptance_criteria, language="gherkin"))

    if voice_initiated:
        content.append(_rule())
        content.append(_paragraph("🎙️ Created via SEJFA Voice Pipeline (VOICE_INITIATED)"))

    return {
        "type": "doc",
        "version": 1,
        "content": content or [_paragraph(description or "No description provided.")],
    }
