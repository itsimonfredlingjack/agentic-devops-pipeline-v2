"""Tests for scripts/classify_failure.py."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

SCRIPT_PATH = Path("scripts/classify_failure.py")

spec = importlib.util.spec_from_file_location("classify_failure", SCRIPT_PATH)
assert spec is not None
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules[spec.name] = module
spec.loader.exec_module(module)


def test_classify_auth_error() -> None:
    lines = ["HTTP 401 Unauthorized while calling Jules endpoint"]
    assert module.classify(lines, rerun_passed=False) == "AUTH"


def test_classify_lint_error() -> None:
    lines = ["ruff check .", "src/foo.py:1:1: F401"]
    assert module.classify(lines, rerun_passed=False) == "LINT_FAIL"


def test_classify_test_failure() -> None:
    lines = ["pytest -q", "FAILED tests/voice_pipeline/test_pipeline.py::test_admin_login"]
    assert module.classify(lines, rerun_passed=False) == "TEST_FAIL"


def test_flaky_when_rerun_passes() -> None:
    lines = ["pytest failed in previous run"]
    assert module.classify(lines, rerun_passed=True) == "FLAKY"


def test_extract_failing_targets() -> None:
    lines = [
        "FAILED tests/voice_pipeline/test_pipeline.py::test_admin_login - AssertionError",
        "::error file=src/voice_pipeline/main.py,line=42,col=1::failure",
    ]
    targets = module.extract_failing_targets(lines)
    assert "tests/voice_pipeline/test_pipeline.py::test_admin_login" in targets
    assert "src/voice_pipeline/main.py" in targets
