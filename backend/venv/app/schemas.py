from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

from app.models import Equipment, LifecycleStatus


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

    vendor_id: Optional[int] = None
    hourly_rate: float = Field(default=0.0, ge=0)


# --------------------------------------------------
# Device Creation
# --------------------------------------------------

class DeviceCreate(BaseModel):
    device_id: str
    equipment_id: str


# --------------------------------------------------
# Vendors
# --------------------------------------------------

class VendorBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=5, max_length=30)
    email: str = Field(min_length=3, max_length=150)
    company: str = Field(min_length=1, max_length=150)


class VendorCreate(VendorBase):
    pass


class VendorUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    phone: Optional[str] = Field(default=None, min_length=5, max_length=30)
    email: Optional[str] = Field(default=None, min_length=3, max_length=150)
    company: Optional[str] = Field(default=None, min_length=1, max_length=150)


class Vendor(VendorBase):
    id: int
    created_at: datetime


class VendorWithCranes(Vendor):
    """Vendor plus the machines they own — powers the dashboard cards."""

    crane_count: int = 0
    cranes: List[Equipment] = []


# --------------------------------------------------
# Cranes / lifecycle
# --------------------------------------------------

class CraneSummary(BaseModel):
    """Crane enriched with vendor contact + current booking context."""

    id: str
    name: str
    equipment_type: str

    latitude: float
    longitude: float
    speed: float
    engine_on: bool

    status: str
    lifecycle_status: LifecycleStatus
    hourly_rate: float

    vendor: Optional[Vendor] = None
    active_booking_id: Optional[int] = None
    active_booking_customer: Optional[str] = None


class LifecycleUpdate(BaseModel):
    lifecycle_status: LifecycleStatus
    note: Optional[str] = Field(default=None, max_length=300)


class FleetStatusCount(BaseModel):
    """One slice of the dashboard status pie chart."""

    lifecycle_status: LifecycleStatus
    count: int


class DashboardSummary(BaseModel):
    total_equipment: int
    total_cranes: int

    crane_status_breakdown: List[FleetStatusCount]

    available_cranes: int
    booked_cranes: int
    working_cranes: int
    repair_cranes: int
    deceased_cranes: int

    total_vendors: int
    active_bookings: int
    pending_payments: int
    revenue_collected: float


# --------------------------------------------------
# Bookings
# --------------------------------------------------

PaymentStatus = Literal["pending", "paid", "failed", "refunded"]

BookingStatus = Literal[
    "pending",
    "confirmed",
    "active",
    "completed",
    "cancelled",
]


class BookingCreate(BaseModel):
    crane_id: str
    customer_name: str = Field(min_length=1, max_length=150)
    customer_phone: Optional[str] = Field(default=None, max_length=30)
    site_address: Optional[str] = Field(default=None, max_length=300)

    start_date: datetime
    end_date: datetime

    @model_validator(mode="after")
    def validate_dates(self):

        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")

        return self


class Booking(BaseModel):
    id: int
    crane_id: str

    customer_name: str
    customer_phone: Optional[str] = None
    site_address: Optional[str] = None

    start_date: datetime
    end_date: datetime

    payment_status: PaymentStatus
    booking_status: BookingStatus

    amount: float
    payment_reference: Optional[str] = None
    created_at: datetime


class BookingWithCrane(Booking):
    crane_name: Optional[str] = None
    vendor_name: Optional[str] = None


class PaymentRequest(BaseModel):
    """Mock payment gateway payload. No real card data is ever accepted."""

    method: Literal["card", "upi", "netbanking", "cash"] = "card"

    # Deliberately fake fields so the POC never handles real credentials.
    simulate_failure: bool = False


class PaymentResult(BaseModel):
    booking_id: int
    payment_status: PaymentStatus
    booking_status: BookingStatus
    payment_reference: Optional[str] = None
    amount: float
    message: str


class BookingStatusUpdate(BaseModel):
    booking_status: BookingStatus
