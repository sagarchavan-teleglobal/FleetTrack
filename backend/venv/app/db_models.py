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

    # Telemetry-derived operational status: working / idle / stopped
    status: Mapped[str] = mapped_column(
        String(20),
        default="stopped"
    )

    # Business lifecycle status, independent of telemetry:
    # available -> booked -> working -> repair -> deceased
    lifecycle_status: Mapped[str] = mapped_column(
        String(20),
        default="available",
        nullable=False,
        server_default="available"
    )

    # Owning vendor (one vendor per machine, nullable for unassigned)
    vendor_id: Mapped[int | None] = mapped_column(
        ForeignKey("vendors.id"),
        nullable=True
    )

    # Hourly rental rate used to price bookings
    hourly_rate: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
        server_default="0"
    )


class VendorDB(Base):
    __tablename__ = "vendors"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    phone: Mapped[str] = mapped_column(
        String(30),
        nullable=False
    )

    email: Mapped[str] = mapped_column(
        String(150),
        nullable=False
    )

    company: Mapped[str] = mapped_column(
        String(150),
        nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False
    )


class BookingDB(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True
    )

    crane_id: Mapped[str] = mapped_column(
        ForeignKey("equipment.id"),
        nullable=False,
        index=True
    )

    customer_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False
    )

    customer_phone: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True
    )

    site_address: Mapped[str | None] = mapped_column(
        String(300),
        nullable=True
    )

    start_date: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False
    )

    end_date: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False
    )

    # pending / paid / failed / refunded
    payment_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending"
    )

    # pending / confirmed / active / completed / cancelled
    booking_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending"
    )

    amount: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=0.0
    )

    # Mock payment reference produced by the fake gateway
    payment_reference: Mapped[str | None] = mapped_column(
        String(60),
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False
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


class AlertDB(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True
    )

    equipment_id: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )

    alert_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False
    )

    severity: Mapped[str] = mapped_column(
        String(20),
        nullable=False
    )

    message: Mapped[str] = mapped_column(
        String(500),
        nullable=False
    )

    timestamp: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False
    )

    acknowledged: Mapped[bool] = mapped_column(
        Boolean,
        default=False
    )


class GeofenceDB(Base):
    __tablename__ = "geofences"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    # Store polygon as JSON string: [[lat,lng], [lat,lng], ...]
    polygon: Mapped[str] = mapped_column(
        String(5000),
        nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False
    )



class ChatMessageDB(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True
    )

    vendor_id: Mapped[int] = mapped_column(
        ForeignKey("vendors.id"),
        nullable=False,
        index=True
    )

    # "user" (fleet manager) or "vendor" (simulated vendor reply)
    sender: Mapped[str] = mapped_column(
        String(20),
        nullable=False
    )

    message: Mapped[str] = mapped_column(
        String(2000),
        nullable=False
    )

    # "sent" / "delivered" / "read"
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="sent"
    )

    # "whatsapp" / "sms" / "in_app"
    channel: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="in_app"
    )

    timestamp: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False
    )


class VoiceCallDB(Base):
    __tablename__ = "voice_calls"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True
    )

    vendor_id: Mapped[int] = mapped_column(
        ForeignKey("vendors.id"),
        nullable=False,
        index=True
    )

    # "outbound" (we call vendor) or "inbound"
    direction: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="outbound"
    )

    # "initiated" / "ringing" / "in_progress" / "completed" / "failed"
    call_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="initiated"
    )

    duration_seconds: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0
    )

    # AI-generated transcript of the call
    transcript: Mapped[str | None] = mapped_column(
        String(5000),
        nullable=True
    )

    # Summary/action items extracted from transcript
    summary: Mapped[str | None] = mapped_column(
        String(1000),
        nullable=True
    )

    # For real integration: Twilio SID or Bland.ai call ID
    external_call_id: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True
    )

    initiated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True
    )
