from datetime import datetime
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