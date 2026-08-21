"""
Alert generation rules.
Checks telemetry data against thresholds and generates alerts.
"""

from datetime import datetime
from sqlalchemy.orm import Session

from app.db_models import AlertDB, DeviceDB


def check_alerts(
    db: Session,
    equipment_id: str,
    speed: float,
    engine_on: bool,
    signal_strength: int,
    device: DeviceDB,
    status: str,
):
    """
    Run alert rules against incoming telemetry.
    Creates alert records for any triggered conditions.
    """
    alerts_created = []
    now = datetime.now()

    # Rule 1: Low signal strength (< 50%)
    if signal_strength < 50:
        alert = AlertDB(
            equipment_id=equipment_id,
            alert_type="low_signal",
            severity="warning",
            message=f"GPS signal strength critically low: {signal_strength}%",
            timestamp=now,
            acknowledged=False,
        )
        db.add(alert)
        alerts_created.append(alert)

    # Rule 2: Overspeed (> 15 km/h for heavy equipment)
    if speed > 15:
        alert = AlertDB(
            equipment_id=equipment_id,
            alert_type="overspeed",
            severity="critical",
            message=f"Equipment exceeding speed limit: {speed:.1f} km/h",
            timestamp=now,
            acknowledged=False,
        )
        db.add(alert)
        alerts_created.append(alert)

    # Rule 3: Device was disconnected and just reconnected
    if device and not device.connected:
        # This means device was previously disconnected
        alert = AlertDB(
            equipment_id=equipment_id,
            alert_type="device_reconnected",
            severity="info",
            message=f"GPS device reconnected after disconnection",
            timestamp=now,
            acknowledged=False,
        )
        db.add(alert)
        alerts_created.append(alert)

    return alerts_created


def check_device_disconnect(
    db: Session,
    equipment_id: str,
    device_id: str,
):
    """
    Called when a device hasn't sent data — generates disconnect alert.
    This would typically be triggered by a background job.
    For POC, we detect it when a device's last_seen is stale.
    """
    now = datetime.now()

    alert = AlertDB(
        equipment_id=equipment_id,
        alert_type="device_disconnected",
        severity="critical",
        message=f"GPS device {device_id} lost connection",
        timestamp=now,
        acknowledged=False,
    )
    db.add(alert)
    return alert
