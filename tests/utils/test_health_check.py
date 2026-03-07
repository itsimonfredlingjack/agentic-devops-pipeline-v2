"""Tests for health check utility function.

GE-38: Health check function that returns status and timestamp.
"""

from datetime import datetime

import pytest

from src.sejfa.utils.health_check import health_check


def test_health_check_exists():
    """Test that health_check function exists and is callable."""
    assert callable(health_check)


def test_health_check_returns_dict():
    """Test that health_check returns a dictionary."""
    result = health_check()
    assert isinstance(result, dict)


def test_health_check_has_status_ok():
    """Test that health_check returns status: ok."""
    result = health_check()
    assert "status" in result
    assert result["status"] == "ok"


def test_health_check_has_timestamp():
    """Test that health_check returns a timestamp."""
    result = health_check()
    assert "timestamp" in result


def test_health_check_timestamp_is_valid_iso_format():
    """Test that the timestamp is in valid ISO format."""
    result = health_check()
    timestamp = result["timestamp"]

    # Should be able to parse as ISO format
    try:
        parsed_time = datetime.fromisoformat(timestamp)
        assert isinstance(parsed_time, datetime)
    except ValueError:
        pytest.fail(f"Timestamp '{timestamp}' is not valid ISO format")


def test_health_check_timestamp_is_recent():
    """Test that the timestamp is recent (within last 5 seconds)."""
    before = datetime.now()
    result = health_check()
    after = datetime.now()

    timestamp = result["timestamp"]
    parsed_time = datetime.fromisoformat(timestamp)

    assert before <= parsed_time <= after, "Timestamp should be current time"
