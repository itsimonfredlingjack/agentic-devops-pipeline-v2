#!/usr/bin/env python3
"""Classifies CI failures into a stable Jules taxonomy."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

TAXONOMY_ORDER = (
    "AUTH",
    "RATE_LIMIT",
    "NETWORK",
    "TIMEOUT",
    "CONFIG",
    "PERMISSION",
    "TEST_FAIL",
    "LINT_FAIL",
    "TYPE_FAIL",
    "BUILD_FAIL",
    "FLAKY",
    "UNKNOWN",
)


def normalize_text(lines: list[str]) -> str:
    return "\n".join(lines).lower()


def extract_failing_targets(lines: list[str]) -> list[str]:
    patterns = [
        re.compile(r"FAILED\s+([^\s]+)"),
        re.compile(r"::error file=([^,\s]+)"),
        re.compile(r"(?i)step\s+([^\n]+?)\s+failed"),
        re.compile(r"(?i)(tests?/[^\s:]+)"),
    ]

    targets: list[str] = []
    for line in lines:
        for pattern in patterns:
            match = pattern.search(line)
            if not match:
                continue
            target = match.group(1).strip().strip(":")
            if target and target not in targets:
                targets.append(target)
            if len(targets) >= 5:
                return targets
    return targets


def classify(lines: list[str], rerun_passed: bool) -> str:
    text = normalize_text(lines)

    if rerun_passed:
        return "FLAKY"

    if re.search(r"\bhttp\s*40[13]\b", text) or "unauthorized" in text:
        return "AUTH"
    if re.search(r"\b40[13]\s+unauthorized\b", text):
        return "AUTH"

    if "429" in text or "rate limit" in text or "too many requests" in text:
        return "RATE_LIMIT"

    if any(
        token in text
        for token in (
            "temporary failure in name resolution",
            "connection reset",
            "connection refused",
            "network is unreachable",
            "ssl error",
        )
    ):
        return "NETWORK"

    if "timeout" in text or "timed out" in text:
        return "TIMEOUT"

    if any(
        token in text
        for token in (
            "not configured",
            "missing secret",
            "missing env",
            "keyerror",
            "no such file or directory: '.env'",
            "jules_api_key not configured",
        )
    ):
        return "CONFIG"

    if any(
        token in text
        for token in (
            "resource not accessible by integration",
            "insufficient permission",
            "requires write access",
            "permission denied",
            "forbidden",
        )
    ):
        return "PERMISSION"

    if any(
        token in text
        for token in (
            "ruff check",
            "ruff format --check",
            "flake8",
            "eslint",
            "lint failed",
        )
    ):
        return "LINT_FAIL"

    if any(token in text for token in ("mypy", "pyright", "tsc", "type error")):
        return "TYPE_FAIL"

    if any(
        token in text
        for token in (
            "pytest",
            "assertionerror",
            "failed tests",
            "1 failed",
            "test session starts",
            "collected",
        )
    ):
        return "TEST_FAIL"

    if any(
        token in text
        for token in (
            "build failed",
            "compilation failed",
            "error: process completed with exit code",
            "make: ***",
        )
    ):
        return "BUILD_FAIL"

    return "UNKNOWN"


def write_github_output(path: str, key: str, value: str) -> None:
    with Path(path).open("a", encoding="utf-8") as handle:
        handle.write(f"{key}={value}\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--log-file", default="")
    parser.add_argument("--rerun-passed", action="store_true")
    parser.add_argument("--output-file", default="")
    parser.add_argument("--github-output", default="")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    lines: list[str] = []
    if args.log_file:
        path = Path(args.log_file)
        if path.exists() and path.is_file():
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()

    taxonomy = classify(lines, rerun_passed=args.rerun_passed)
    targets = extract_failing_targets(lines)

    classification = {
        "taxonomy": taxonomy,
        "failing_targets": targets,
        "known_taxonomy": list(TAXONOMY_ORDER),
    }

    if args.output_file:
        Path(args.output_file).parent.mkdir(parents=True, exist_ok=True)
        Path(args.output_file).write_text(
            json.dumps(classification, indent=2),
            encoding="utf-8",
        )

    if args.github_output:
        write_github_output(args.github_output, "taxonomy", taxonomy)
        write_github_output(
            args.github_output,
            "failing_targets",
            json.dumps(targets, ensure_ascii=True),
        )

    print(json.dumps(classification, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
