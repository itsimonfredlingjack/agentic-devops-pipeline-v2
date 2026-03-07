#!/usr/bin/env python3
"""Builds a compact, deterministic Jules context payload for workflows."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ProfileBudget:
    max_diff_chars: int
    max_log_lines: int
    max_context_chars: int
    max_files: int
    max_hunks_per_file: int
    max_error_snippets: int


PROFILE_BUDGETS = {
    "QUICK_REVIEW": ProfileBudget(
        max_diff_chars=9000,
        max_log_lines=80,
        max_context_chars=5000,
        max_files=10,
        max_hunks_per_file=3,
        max_error_snippets=6,
    ),
    "HEALING_FIX": ProfileBudget(
        max_diff_chars=7000,
        max_log_lines=120,
        max_context_chars=6000,
        max_files=8,
        max_hunks_per_file=4,
        max_error_snippets=10,
    ),
    "DEEP_REVIEW": ProfileBudget(
        max_diff_chars=15000,
        max_log_lines=180,
        max_context_chars=8000,
        max_files=15,
        max_hunks_per_file=6,
        max_error_snippets=14,
    ),
}

EXCLUDED_PATH_PREFIXES = (
    "vendor/",
    ".venv/",
    "venv/",
    "node_modules/",
)

BINARY_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".pdf",
    ".zip",
    ".gz",
    ".tar",
    ".jar",
    ".exe",
    ".so",
    ".dll",
    ".bin",
}

MASK_RULES: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"(?i)(authorization\s*:\s*)(bearer\s+)?[A-Za-z0-9._\-+/=]{8,}"),
        r"\1[REDACTED]",
    ),
    (
        re.compile(r"(?i)(x-api-key\s*:\s*)[A-Za-z0-9._\-+/=]{8,}"),
        r"\1[REDACTED]",
    ),
    (
        re.compile(
            r"(?i)\b([A-Z0-9_]*(TOKEN|SECRET|PASSWORD|API_KEY)[A-Z0-9_]*)\s*="
            r"\s*[^\s'\"]+"
        ),
        r"\1=[REDACTED]",
    ),
]

SENSITIVE_FILE_PATTERNS = (
    ".github/workflows/",
    "auth",
    "secret",
    "token",
)


class PayloadError(RuntimeError):
    """Raised when payload input is invalid."""


def run_git(args: list[str]) -> str:
    result = subprocess.run(
        ["git", *args],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return ""
    return result.stdout


def mask_line(line: str) -> str:
    masked = line
    for pattern, replacement in MASK_RULES:
        masked = pattern.sub(replacement, masked)
    return masked


def is_excluded_path(path: str) -> bool:
    normalized = path.strip()
    if not normalized:
        return True
    if normalized.startswith(EXCLUDED_PATH_PREFIXES):
        return True
    if f"/{normalized}".find("/vendor/") != -1:
        return True
    if f"/{normalized}".find("/.venv/") != -1:
        return True
    if f"/{normalized}".find("/node_modules/") != -1:
        return True
    return Path(normalized).suffix.lower() in BINARY_EXTENSIONS


def changed_file_stats(base_sha: str, head_sha: str) -> list[dict[str, int | str]]:
    stats_text = run_git(["diff", "--numstat", f"{base_sha}..{head_sha}"])
    status_text = run_git(["diff", "--name-status", f"{base_sha}..{head_sha}"])

    status_map: dict[str, str] = {}
    for line in status_text.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            status_map[parts[-1]] = parts[0]

    files: list[dict[str, int | str]] = []
    for line in stats_text.splitlines():
        parts = line.split("\t")
        if len(parts) != 3:
            continue
        add_raw, del_raw, path = parts
        if is_excluded_path(path):
            continue
        additions = int(add_raw) if add_raw.isdigit() else 0
        deletions = int(del_raw) if del_raw.isdigit() else 0
        files.append(
            {
                "path": path,
                "additions": additions,
                "deletions": deletions,
                "size": additions + deletions,
                "status": status_map.get(path, "M"),
            }
        )

    files.sort(key=lambda item: (int(item["size"]), str(item["path"])), reverse=True)
    return files


def split_hunks(patch_text: str) -> list[str]:
    hunks: list[str] = []
    current: list[str] = []

    for line in patch_text.splitlines():
        if line.startswith("@@"):
            if current:
                hunks.append("\n".join(current))
            current = [line]
            continue
        if current:
            current.append(mask_line(line))

    if current:
        hunks.append("\n".join(current))

    hunks.sort(key=lambda entry: len(entry), reverse=True)
    return hunks


def extract_change_types(status: str, additions: int, deletions: int) -> list[str]:
    if status.startswith("A"):
        return ["added"]
    if status.startswith("D"):
        return ["deleted"]
    if status.startswith("R"):
        return ["renamed"]
    if additions and deletions:
        return ["modified"]
    if additions:
        return ["insertions"]
    if deletions:
        return ["removals"]
    return ["modified"]


def risk_areas_for_path(path: str) -> list[str]:
    lowered = path.lower()
    risks: set[str] = set()

    if lowered.startswith(".github/workflows/"):
        risks.add("ci_cd")
    if "auth" in lowered:
        risks.add("auth")
    if "secret" in lowered or "token" in lowered:
        risks.add("secrets")
    if "test" in lowered:
        risks.add("tests")
    if lowered.endswith(("requirements.txt", "pyproject.toml")):
        risks.add("dependencies")
    if lowered.endswith(("main.py",)):
        risks.add("entrypoint")

    if not risks:
        risks.add("general")

    return sorted(risks)


def build_compact_diff(
    base_sha: str,
    head_sha: str,
    budget: ProfileBudget,
) -> tuple[str, list[dict[str, object]], int]:
    files = changed_file_stats(base_sha, head_sha)
    selected_files = files[: budget.max_files]

    diff_parts: list[str] = []
    patch_index: list[dict[str, object]] = []
    total_chars = 0

    for file_info in selected_files:
        path = str(file_info["path"])
        raw_patch = run_git(["diff", "--unified=3", f"{base_sha}..{head_sha}", "--", path])
        hunks = split_hunks(raw_patch)
        chosen_hunks = hunks[: budget.max_hunks_per_file]

        chunk_lines = [f"FILE: {path}"] + chosen_hunks
        chunk_text = "\n".join(chunk_lines).strip()

        if not chunk_text:
            continue

        remaining = budget.max_diff_chars - total_chars
        if remaining <= 0:
            break

        truncated = False
        if len(chunk_text) > remaining:
            chunk_text = chunk_text[:remaining]
            truncated = True

        diff_parts.append(chunk_text)
        total_chars += len(chunk_text)

        patch_index.append(
            {
                "path": path,
                "status": file_info["status"],
                "change_types": extract_change_types(
                    str(file_info["status"]),
                    int(file_info["additions"]),
                    int(file_info["deletions"]),
                ),
                "risk_areas": risk_areas_for_path(path),
                "additions": file_info["additions"],
                "deletions": file_info["deletions"],
                "hunks_total": len(hunks),
                "hunks_sent": len(chosen_hunks),
                "truncated": truncated,
            }
        )

        if total_chars >= budget.max_diff_chars:
            break

    return "\n\n".join(diff_parts), patch_index, len(files)


def read_lines(path: str | None) -> list[str]:
    if not path:
        return []
    file_path = Path(path)
    if not file_path.exists() or not file_path.is_file():
        return []
    return file_path.read_text(encoding="utf-8", errors="replace").splitlines()


def extract_failing_tests(lines: Iterable[str]) -> list[str]:
    patterns = [
        re.compile(r"FAILED\s+([^\s]+)"),
        re.compile(r"(?i)test\s+failed:\s+([^\s]+)"),
    ]
    found: list[str] = []
    for line in lines:
        for pattern in patterns:
            match = pattern.search(line)
            if match:
                target = match.group(1).strip().strip(",")
                if target and target not in found:
                    found.append(target)
    return found[:20]


def extract_error_snippets(lines: list[str], budget: ProfileBudget) -> list[str]:
    interesting = [
        mask_line(line.strip())
        for line in lines
        if re.search(r"(?i)error|exception|traceback|failed|assert", line)
    ]
    if not interesting:
        interesting = [mask_line(line.strip()) for line in lines[-budget.max_log_lines :]]

    snippets: list[str] = []
    for line in interesting:
        if not line:
            continue
        truncated = line[:280]
        if truncated not in snippets:
            snippets.append(truncated)
        if len(snippets) >= budget.max_error_snippets:
            break
    return snippets


def profile_constraints(profile: str) -> list[str]:
    base_constraints = [
        "Signal over verbosity: keep findings compact and actionable.",
        "Never output secrets or auth headers.",
        "Ignore vendor/, .venv/, node_modules/, and large binaries.",
        "Do not propose sweeping refactors.",
    ]

    if profile == "HEALING_FIX":
        base_constraints.extend(
            [
                "Prefer the smallest deterministic fix to recover CI.",
                "Avoid changes to workflows/auth/secret handling unless ARMORED=true.",
            ]
        )
    elif profile == "QUICK_REVIEW":
        base_constraints.append("Return at most 8 high-impact findings.")
    elif profile == "DEEP_REVIEW":
        base_constraints.append("Prioritize correctness before style feedback.")

    return base_constraints


def write_github_output(path: str, key: str, value: str) -> None:
    with Path(path).open("a", encoding="utf-8") as handle:
        handle.write(f"{key}={value}\n")


def trim_context(context: dict[str, object], max_chars: int) -> dict[str, object]:
    serialized = json.dumps(context, ensure_ascii=True, separators=(",", ":"))
    if len(serialized) <= max_chars:
        return context

    context = dict(context)
    snippets = list(context.get("error_snippets", []))
    while snippets and len(serialized) > max_chars:
        snippets = snippets[:-1]
        context["error_snippets"] = snippets
        serialized = json.dumps(context, ensure_ascii=True, separators=(",", ":"))

    compact_diff = str(context.get("compact_diff", ""))
    if len(serialized) > max_chars and compact_diff:
        keep = max(0, max_chars - (len(serialized) - len(compact_diff)) - 24)
        context["compact_diff"] = compact_diff[:keep]
        serialized = json.dumps(context, ensure_ascii=True, separators=(",", ":"))

    changed_files = list(context.get("changed_files", []))
    patch_index = list(context.get("patch_index", []))
    while len(serialized) > max_chars and changed_files and patch_index:
        changed_files = changed_files[:-1]
        patch_index = patch_index[:-1]
        context["changed_files"] = changed_files
        context["patch_index"] = patch_index
        serialized = json.dumps(context, ensure_ascii=True, separators=(",", ":"))

    return context


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", choices=sorted(PROFILE_BUDGETS), required=True)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--pr-number", default="")
    parser.add_argument("--base-sha", default="")
    parser.add_argument("--head-sha", default="")
    parser.add_argument("--log-file", default="")
    parser.add_argument("--log-url", default="")
    parser.add_argument("--output-file", default="")
    parser.add_argument("--github-output", default="")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    budget = PROFILE_BUDGETS[args.profile]

    base_sha = args.base_sha.strip()
    head_sha = args.head_sha.strip() or args.sha.strip()

    compact_diff = ""
    patch_index: list[dict[str, object]] = []
    files_changed_count = 0

    if base_sha and head_sha:
        compact_diff, patch_index, files_changed_count = build_compact_diff(
            base_sha=base_sha,
            head_sha=head_sha,
            budget=budget,
        )

    raw_log_lines = read_lines(args.log_file)
    tail_lines = [mask_line(line) for line in raw_log_lines[-budget.max_log_lines :]]
    failing_tests = extract_failing_tests(raw_log_lines)
    error_snippets = extract_error_snippets(raw_log_lines, budget)

    sensitive_paths = [
        item["path"]
        for item in patch_index
        if any(marker in str(item["path"]).lower() for marker in SENSITIVE_FILE_PATTERNS)
    ]

    context: dict[str, object] = {
        "repo": args.repo,
        "sha": args.sha,
        "pr": int(args.pr_number) if str(args.pr_number).isdigit() else None,
        "profile": args.profile,
        "changed_files": [item["path"] for item in patch_index],
        "patch_index": patch_index,
        "compact_diff": compact_diff,
        "failing_tests": failing_tests,
        "error_snippets": error_snippets,
        "log_excerpt": tail_lines,
        "log_url": args.log_url,
        "constraints": profile_constraints(args.profile),
        "sensitive_paths": sensitive_paths,
    }

    trimmed_context = trim_context(context, budget.max_context_chars)
    serialized = json.dumps(trimmed_context, ensure_ascii=True, separators=(",", ":"))

    if not serialized:
        raise PayloadError("Failed to build Jules context payload")

    if args.output_file:
        Path(args.output_file).parent.mkdir(parents=True, exist_ok=True)
        Path(args.output_file).write_text(
            json.dumps(trimmed_context, ensure_ascii=True, indent=2),
            encoding="utf-8",
        )

    if args.github_output:
        write_github_output(args.github_output, "jules_context", serialized)
        write_github_output(
            args.github_output,
            "files_changed_count",
            str(files_changed_count),
        )
        write_github_output(
            args.github_output,
            "diff_bytes_sent",
            str(len(trimmed_context.get("compact_diff", "").encode("utf-8"))),
        )
        write_github_output(
            args.github_output,
            "log_lines_sent",
            str(len(trimmed_context.get("log_excerpt", []))),
        )

    print(serialized)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
