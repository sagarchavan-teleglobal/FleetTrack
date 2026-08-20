from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EquipmentDB(Base):
    __tablename__ = "equipment"

    id: Mapped[str] = mapped_column(
        String(50),
        primary_key=True
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    equipment_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )

    latitude: Mapped[float] = mapped_column(
        Float,
        nullable=False
    )

    longitude: Mapped[float] = mapped_column(
        Float,
        nullable=False
    )

    speed: Mapped[float] = mapped_column(
        Float,
        default=0.0
    )

    engine_on: Mapped[bool] = mapped_column(
        Boolean,
        default=False
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default="stopped"
    )


class TelemetryDB(Base):
    __tablename__ = "telemetry"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True
    )

    equipment_id: Mapped[str] = mapped_column(
        ForeignKey("equipment.id"),
        nullable=False
    )

    device_id: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )

    latitude: Mapped[float] = mapped_column(
        Float,
        nullable=False
    )

    longitude: Mapped[float] = mapped_column(
        Float,
        nullable=False
    )

    speed: Mapped[float] = mapped_column(
        Float,
        nullable=False
    )

    engine_on: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False
    )

    timestamp: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False
    )

    signal_strength: Mapped[int] = mapped_column(
        Integer,
        nullable=False
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False
    )

class DeviceDB(Base):
    __tablename__ = "devices"

    device_id: Mapped[str] = mapped_column(
        String(50),
        primary_key=True
    )

    equipment_id: Mapped[str] = mapped_column(
        ForeignKey("equipment.id"),
        nullable=False
    )

    connected: Mapped[bool] = mapped_column(
        Boolean,
        default=False
    )

    last_seen: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True
    )

    signal_strength: Mapped[int] = mapped_column(
        Integer,
        default=0
    )