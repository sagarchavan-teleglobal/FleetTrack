from pydantic import BaseModel
from typing import Literal, Optional


# Telemetry-derived operational status
EquipmentStatus = Literal["working", "idle", "stopped"]

# Business lifecycle status
LifecycleStatus = Literal[
    "available",
    "booked",
    "working",
    "repair",
    "deceased",
]


class Equipment(BaseModel):
    id: str
    name: str
    equipment_type: Literal["tractor", "crane", "excavator", "dumper"]
    latitude: float
    longitude: float
    speed: float = 0.0
    engine_on: bool = False
    status: EquipmentStatus = "stopped"

    lifecycle_status: LifecycleStatus = "available"
    vendor_id: Optional[int] = None
    hourly_rate: float = 0.0
