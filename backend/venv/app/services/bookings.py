"""
Booking service — availability checks, booking creation,
mock payment processing, and lifecycle transitions.
"""

import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db_models import BookingDB, EquipmentDB, VendorDB


# --------------------------------------------------
# Helpers
# --------------------------------------------------

def _strip_tz(dt: datetime) -> datetime:
    """Return a timezone-naive datetime (UTC assumed)."""
    if dt.tzinfo is not None:
        return dt.replace(tzinfo=None)
    return dt


def _hours_between(start: datetime, end: datetime) -> float:
    """Compute rental hours (minimum 1 hour)."""
    delta = (end - start).total_seconds() / 3600
    return max(delta, 1.0)


# --------------------------------------------------
# Availability
# --------------------------------------------------

def get_available_cranes(
    db: Session,
    start_date: datetime,
    end_date: datetime,
):
    """
    Return cranes whose lifecycle_status is 'available' AND
    have no overlapping confirmed/active bookings in the date range.
    """

    start_date = _strip_tz(start_date)
    end_date = _strip_tz(end_date)

    # All cranes that are lifecycle-available
    cranes = (
        db.query(EquipmentDB)
        .filter(
            EquipmentDB.equipment_type == "crane",
            EquipmentDB.lifecycle_status == "available",
        )
        .all()
    )

    available = []

    for crane in cranes:

        overlap = (
            db.query(BookingDB)
            .filter(
                BookingDB.crane_id == crane.id,
                BookingDB.booking_status.in_(["confirmed", "active"]),
                BookingDB.start_date < end_date,
                BookingDB.end_date > start_date,
            )
            .first()
        )

        if overlap is None:
            available.append(crane)

    return available


def check_overlap(
    db: Session,
    crane_id: str,
    start_date: datetime,
    end_date: datetime,
    exclude_booking_id: int | None = None,
) -> bool:
    """Return True if the crane has a conflicting booking."""

    start_date = _strip_tz(start_date)
    end_date = _strip_tz(end_date)

    query = (
        db.query(BookingDB)
        .filter(
            BookingDB.crane_id == crane_id,
            BookingDB.booking_status.in_(["confirmed", "active"]),
            BookingDB.start_date < end_date,
            BookingDB.end_date > start_date,
        )
    )

    if exclude_booking_id is not None:
        query = query.filter(BookingDB.id != exclude_booking_id)

    return query.first() is not None


# --------------------------------------------------
# Booking Creation
# --------------------------------------------------

def create_booking(
    db: Session,
    crane_id: str,
    customer_name: str,
    start_date: datetime,
    end_date: datetime,
    customer_phone: str | None = None,
    site_address: str | None = None,
) -> BookingDB:
    """
    Create a new pending booking for a crane.
    Validates crane exists, is available, and has no date overlap.
    """

    start_date = _strip_tz(start_date)
    end_date = _strip_tz(end_date)

    # 1. Verify crane exists and is a crane
    crane = (
        db.query(EquipmentDB)
        .filter(
            EquipmentDB.id == crane_id,
            EquipmentDB.equipment_type == "crane",
        )
        .first()
    )

    if crane is None:
        raise HTTPException(
            status_code=404,
            detail="Crane not found"
        )

    # 2. Lifecycle must be 'available'
    if crane.lifecycle_status not in ("available",):
        raise HTTPException(
            status_code=409,
            detail=f"Crane is currently '{crane.lifecycle_status}' and cannot be booked"
        )

    # 3. Date overlap check
    if check_overlap(db, crane_id, start_date, end_date):
        raise HTTPException(
            status_code=409,
            detail="Crane already has a booking in the requested date range"
        )

    # 4. Compute amount from hourly rate
    hours = _hours_between(start_date, end_date)
    amount = round(crane.hourly_rate * hours, 2)

    # 5. Persist booking
    booking = BookingDB(
        crane_id=crane_id,
        customer_name=customer_name,
        customer_phone=customer_phone,
        site_address=site_address,
        start_date=start_date,
        end_date=end_date,
        payment_status="pending",
        booking_status="pending",
        amount=amount,
        created_at=datetime.utcnow(),
    )

    db.add(booking)
    db.commit()
    db.refresh(booking)

    return booking


# --------------------------------------------------
# Mock Payment
# --------------------------------------------------

def process_payment(
    db: Session,
    booking_id: int,
    simulate_failure: bool = False,
) -> dict:
    """
    Simulates a payment gateway call.
    On success: marks booking confirmed and transitions crane to 'booked'.
    """

    booking = (
        db.query(BookingDB)
        .filter(BookingDB.id == booking_id)
        .first()
    )

    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.payment_status == "paid":
        raise HTTPException(status_code=409, detail="Booking already paid")

    if booking.booking_status == "cancelled":
        raise HTTPException(status_code=409, detail="Cannot pay for cancelled booking")

    # Simulate gateway
    if simulate_failure:

        booking.payment_status = "failed"
        db.commit()

        return {
            "booking_id": booking.id,
            "payment_status": "failed",
            "booking_status": booking.booking_status,
            "payment_reference": None,
            "amount": booking.amount,
            "message": "Payment declined (simulated failure)",
        }

    # Success path
    reference = f"PAY-{uuid.uuid4().hex[:12].upper()}"

    booking.payment_status = "paid"
    booking.payment_reference = reference
    booking.booking_status = "confirmed"

    # Transition crane lifecycle
    crane = (
        db.query(EquipmentDB)
        .filter(EquipmentDB.id == booking.crane_id)
        .first()
    )

    if crane and crane.lifecycle_status == "available":
        crane.lifecycle_status = "booked"

    db.commit()
    db.refresh(booking)

    return {
        "booking_id": booking.id,
        "payment_status": "paid",
        "booking_status": booking.booking_status,
        "payment_reference": reference,
        "amount": booking.amount,
        "message": "Payment successful",
    }


# --------------------------------------------------
# Booking Status Transitions
# --------------------------------------------------

_VALID_TRANSITIONS = {
    "pending": ["confirmed", "cancelled"],
    "confirmed": ["active", "cancelled"],
    "active": ["completed", "cancelled"],
    "completed": [],
    "cancelled": [],
}


def update_booking_status(
    db: Session,
    booking_id: int,
    new_status: str,
) -> BookingDB:
    """
    Transition a booking through its state machine.
    Also manages crane lifecycle_status accordingly.
    """

    booking = (
        db.query(BookingDB)
        .filter(BookingDB.id == booking_id)
        .first()
    )

    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")

    allowed = _VALID_TRANSITIONS.get(booking.booking_status, [])

    if new_status not in allowed:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot transition from '{booking.booking_status}' "
                f"to '{new_status}'. Allowed: {allowed}"
            ),
        )

    booking.booking_status = new_status

    # Side effects on crane lifecycle
    crane = (
        db.query(EquipmentDB)
        .filter(EquipmentDB.id == booking.crane_id)
        .first()
    )

    if crane:

        if new_status == "confirmed" and crane.lifecycle_status == "available":
            crane.lifecycle_status = "booked"

        elif new_status == "active" and crane.lifecycle_status == "booked":
            crane.lifecycle_status = "working"

        elif new_status in ("completed", "cancelled"):
            # Check if any other active/confirmed bookings remain
            other = (
                db.query(BookingDB)
                .filter(
                    BookingDB.crane_id == crane.id,
                    BookingDB.id != booking.id,
                    BookingDB.booking_status.in_(["confirmed", "active"]),
                )
                .first()
            )

            if other is None:
                crane.lifecycle_status = "available"

    db.commit()
    db.refresh(booking)

    return booking


# --------------------------------------------------
# Lifecycle Manual Override
# --------------------------------------------------

def update_crane_lifecycle(
    db: Session,
    crane_id: str,
    new_status: str,
) -> EquipmentDB:
    """
    Manually set crane lifecycle (e.g. repair, deceased).
    Cancels active bookings when moved to repair/deceased.
    """

    crane = (
        db.query(EquipmentDB)
        .filter(
            EquipmentDB.id == crane_id,
            EquipmentDB.equipment_type == "crane",
        )
        .first()
    )

    if crane is None:
        raise HTTPException(status_code=404, detail="Crane not found")

    # If moving to repair or deceased, cancel outstanding bookings
    if new_status in ("repair", "deceased"):

        active_bookings = (
            db.query(BookingDB)
            .filter(
                BookingDB.crane_id == crane_id,
                BookingDB.booking_status.in_(["pending", "confirmed", "active"]),
            )
            .all()
        )

        for b in active_bookings:
            b.booking_status = "cancelled"

    crane.lifecycle_status = new_status

    db.commit()
    db.refresh(crane)

    return crane
