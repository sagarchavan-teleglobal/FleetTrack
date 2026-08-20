from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class Telemetry(BaseModel):
    equipment_id: str
    device_id: str

    latitude: float
    longitude: float
    speed: float

    engine_on: bool

    timestamp: datetime
    signal_strength: int


class TelemetryRecord(Telemetry):
    status: str


# --------------------------------------------------
# Equipment Creation
# --------------------------------------------------

class EquipmentCreate(BaseModel):
    id: str
    name: str
    equipment_type: Literal["tractor", "crane", "excavator", "dumper"]
    latitude: float = 18.5204
    longitude: float = 73.8567


# --------------------------------------------------
# Device Creation
# --------------------------------------------------

class DeviceCreate(BaseModel):
    device_id: str
    equipment_id: str