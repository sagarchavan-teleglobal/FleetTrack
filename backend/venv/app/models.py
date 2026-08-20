from pydantic import BaseModel
from typing import Literal


class Equipment(BaseModel):
    id: str
    name: str
    equipment_type: Literal["tractor", "crane", "excavator", "dumper"]
    latitude: float
    longitude: float
    speed: float = 0.0
    engine_on: bool = False
    status: Literal["working", "idle", "stopped"] = "offline"