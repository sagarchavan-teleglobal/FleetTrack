from pydantic import BaseModel
from datetime import datetime


class Device(BaseModel):
    device_id: str
    equipment_id: str

    connected: bool = False

    last_seen: datetime | None = None
    signal_strength: int = 0