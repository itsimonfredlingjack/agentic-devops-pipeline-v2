"""Health check utility function.

GE-38: Simple health check that returns status and current timestamp.
"""

from datetime import datetime


def health_check() -> dict[str, str]:
    """Return health check status with current timestamp.

    Returns:
        dict: Dictionary containing:
            - status: Always "ok"
            - timestamp: Current timestamp in ISO 8601 format

    Example:
        >>> result = health_check()
        >>> result["status"]
        'ok'
        >>> "timestamp" in result
        True
    """
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
    }
