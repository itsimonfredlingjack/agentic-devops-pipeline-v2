#!/usr/bin/env python3
"""
PreToolUse Security Hook

Validates tool usage before execution to prevent:
1. Unauthorized package installations
2. Modifications to security-critical files
3. Dangerous shell commands (injection vectors)

Exit codes:
- 0: Allow tool execution
- 2: Block tool execution (with reason in stderr)
"""

import json
import sys
import re
from pathlib import Path


# ============================================================================
# SECURITY CONFIGURATION
# ============================================================================

# Minimal fallback defaults (test/lint only) - used when package-allowlist.json is missing
ALLOWED_NPM_PACKAGES = {
    "jest", "vitest", "eslint", "prettier", "typescript", "@types/*",
}

ALLOWED_PIP_PACKAGES = {
    "pytest", "pytest-cov", "ruff", "mypy",
}

# Paths that cannot be written to
PROTECTED_PATHS = [
    ".github/",
    ".claude/hooks/",
    ".githooks/",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    ".env",
]

# Dangerous shell patterns
DANGEROUS_PATTERNS = [
    r"curl\s+.*\|\s*(bash|sh|zsh)",           # curl | bash
    r"wget\s+.*\|\s*(bash|sh|zsh)",           # wget | bash
    r"\beval\s*\(",                            # eval()
    r"\beval\s+",                              # eval command
    r">\s*/etc/",                              # Write to /etc
    r"rm\s+-rf\s+/",                           # rm -rf /
    r"rm\s+-rf\s+\*",                          # rm -rf *
    r":\(\)\s*\{\s*:\|:&\s*\}",               # Fork bomb
    r"mkfs\.",                                 # Format filesystem
    r"dd\s+if=.*of=/dev/",                    # Direct disk write
    r"chmod\s+777",                            # Overly permissive
    r"chmod\s+\+s",                            # Setuid
    r"sudo\s+",                                # Sudo commands
    r"su\s+-",                                 # Switch user
    r">/dev/sd",                               # Write to disk
    r"\$\(.*\)",                               # Command substitution (careful)
    r"`.*`",                                   # Backtick execution
    r"nc\s+-l",                                # Netcat listener
    r"python.*-c\s*['\"].*exec",              # Python exec
    r"node.*-e\s*['\"].*child_process",       # Node child_process
    r"base64\s+-d.*\|.*sh",                   # Encoded payload execution
]

# Commands that need extra scrutiny
SENSITIVE_COMMANDS = [
    "npm install",
    "npm i ",
    "yarn add",
    "pnpm add",
    "pip install",
    "pip3 install",
    "poetry add",
]


# ============================================================================
# VALIDATION FUNCTIONS
# ============================================================================

def load_custom_allowlist():
    """Load project-specific package allowlist if exists."""
    allowlist_path = Path.cwd() / ".claude" / "package-allowlist.json"
    if allowlist_path.exists():
        with open(allowlist_path) as f:
            custom = json.load(f)
            return (
                set(custom.get("npm", [])),
                set(custom.get("pip", []))
            )
    return set(), set()


def validate_package_install(command: str) -> tuple[bool, str]:
    """Validate npm/pip install commands against allowlist."""
    custom_npm, custom_pip = load_custom_allowlist()
    allowed_npm = ALLOWED_NPM_PACKAGES | custom_npm
    allowed_pip = ALLOWED_PIP_PACKAGES | custom_pip

    # Extract package names from command
    if "npm install" in command or "npm i " in command or "yarn add" in command:
        # npm install package1 package2 --save-dev
        parts = command.split()
        packages = [p for p in parts if not p.startswith("-") and p not in
                   ["npm", "install", "i", "yarn", "add", "pnpm"]]

        for pkg in packages:
            # Handle scoped packages @org/package
            pkg_name = pkg.split("@")[0] if "@" in pkg and not pkg.startswith("@") else pkg
            pkg_name = pkg_name.split("/")[0] if "/" in pkg_name and not pkg_name.startswith("@") else pkg_name

            # Check against allowlist (support wildcards like @types/*)
            if pkg_name not in allowed_npm:
                # Check for wildcard matches
                if not any(pkg_name.startswith(a.replace("*", "")) for a in allowed_npm if "*" in a):
                    return False, f"Package '{pkg_name}' not in allowlist. Add to .claude/package-allowlist.json"

    elif "pip install" in command or "pip3 install" in command or "poetry add" in command:
        parts = command.split()
        packages = [p for p in parts if not p.startswith("-") and p not in
                   ["pip", "pip3", "install", "poetry", "add"]]

        for pkg in packages:
            pkg_name = pkg.split("==")[0].split(">=")[0].split("<=")[0].split("[")[0]
            if pkg_name not in allowed_pip:
                return False, f"Package '{pkg_name}' not in allowlist. Add to .claude/package-allowlist.json"

    return True, ""


def validate_file_path(path: str, operation: str) -> tuple[bool, str]:
    """Check if file path is protected."""
    path_lower = path.lower()

    for protected in PROTECTED_PATHS:
        if path_lower.startswith(protected.lower()) or f"/{protected.lower()}" in path_lower:
            return False, f"Cannot {operation} protected path: {protected}"

    return True, ""


def validate_shell_command(command: str) -> tuple[bool, str]:
    """Check for dangerous shell patterns."""
    for pattern in DANGEROUS_PATTERNS:
        if re.search(pattern, command, re.IGNORECASE):
            return False, f"Blocked dangerous pattern: {pattern}"

    return True, ""


def validate_tool_use(tool_name: str, tool_input: dict) -> tuple[bool, str]:
    """Main validation logic for tool usage."""

    # Bash/Shell commands
    if tool_name.lower() in ["bash", "shell", "execute"]:
        command = tool_input.get("command", "")

        # Check for dangerous patterns
        is_safe, reason = validate_shell_command(command)
        if not is_safe:
            return False, reason

        # Check package installations
        for sensitive in SENSITIVE_COMMANDS:
            if sensitive in command.lower():
                is_allowed, reason = validate_package_install(command)
                if not is_allowed:
                    return False, reason

    # File write operations
    elif tool_name.lower() in ["write", "edit", "create_file", "write_file"]:
        file_path = tool_input.get("file_path", "") or tool_input.get("path", "")
        is_allowed, reason = validate_file_path(file_path, "write to")
        if not is_allowed:
            return False, reason

    # File delete operations
    elif tool_name.lower() in ["delete", "remove", "rm"]:
        file_path = tool_input.get("file_path", "") or tool_input.get("path", "")
        is_allowed, reason = validate_file_path(file_path, "delete")
        if not is_allowed:
            return False, reason

    return True, ""


# ============================================================================
# MAIN
# ============================================================================

def main():
    """Main hook logic."""
    try:
        # Read input from stdin
        input_data = sys.stdin.read()

        if not input_data.strip():
            sys.exit(0)  # No input, allow

        try:
            hook_input = json.loads(input_data)
        except json.JSONDecodeError:
            sys.exit(0)  # Invalid JSON, fail open

        tool_name = hook_input.get("tool_name", "")
        tool_input = hook_input.get("tool_input", {})

        # Validate
        is_allowed, reason = validate_tool_use(tool_name, tool_input)

        if is_allowed:
            sys.exit(0)
        else:
            response = {
                "blocked": True,
                "reason": reason,
                "tool": tool_name,
                "suggestion": "Review the command and try an alternative approach"
            }
            json.dump(response, sys.stderr)
            sys.exit(2)

    except Exception as e:
        # Fail open on errors to prevent stuck state
        error_response = {"error": str(e), "action": "allow_on_error"}
        json.dump(error_response, sys.stderr)
        sys.exit(0)


if __name__ == "__main__":
    main()
