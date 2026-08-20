from datetime import datetime
from typing import List


def calculate_utilization(records: List):
    """
    Calculate working, idle and offline duration
    from telemetry records.
    """

    if len(records) < 2:
        return {
            "working_seconds": 0,
            "idle_seconds": 0,
            "offline_seconds": 0,
            "total_seconds": 0,
            "uptime_percentage": 0,
            "utilization_percentage": 0,
        }

    # Make sure records are chronological
    records = sorted(
        records,
        key=lambda record: record.timestamp
    )

    working_seconds = 0
    idle_seconds = 0
    offline_seconds = 0

    for current, next_record in zip(records, records[1:]):

        duration = (
            next_record.timestamp - current.timestamp
        ).total_seconds()

        if current.status == "working":
            working_seconds += duration

        elif current.status == "idle":
            idle_seconds += duration

        elif current.status == "offline":
            offline_seconds += duration

    total_seconds = (
        working_seconds
        + idle_seconds
        + offline_seconds
    )

    # Uptime = engine operating time / total observed time
    uptime_seconds = (
        working_seconds
        + idle_seconds
    )

    uptime_percentage = (
        uptime_seconds / total_seconds * 100
        if total_seconds > 0
        else 0
    )

    # Utilization = productive working time / uptime
    utilization_percentage = (
        working_seconds / uptime_seconds * 100
        if uptime_seconds > 0
        else 0
    )

    return {
        "working_seconds": round(working_seconds, 2),
        "idle_seconds": round(idle_seconds, 2),
        "offline_seconds": round(offline_seconds, 2),
        "total_seconds": round(total_seconds, 2),
        "uptime_percentage": round(uptime_percentage, 2),
        "utilization_percentage": round(
            utilization_percentage,
            2
        ),
    }