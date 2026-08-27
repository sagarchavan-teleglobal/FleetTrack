"""
Razorpay payment integration.

Handles order creation, payment verification, and webhook processing.
When RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set, operates in
demo mode — simulates the Razorpay flow locally so the frontend
checkout popup still works without real credentials.

To go live:
  1. Create a Razorpay account at https://dashboard.razorpay.com
  2. Get test keys from Settings > API Keys
  3. Set environment variables:
       RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
       RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
  4. Restart the backend

The frontend Razorpay checkout will automatically use the key_id to
load the real payment modal.
"""

import hashlib
import hmac
import logging
import os
import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db_models import BookingDB, EquipmentDB

logger = logging.getLogger(__name__)


RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")

# When True, uses the real Razorpay SDK. When False, simulates locally.
LIVE_MODE = bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)

_razorpay_client = None


def _get_client():
    """Lazy-init the Razorpay client (only when live keys are set)."""
    global _razorpay_client

    if not LIVE_MODE:
        return None

    if _razorpay_client is None:
        import razorpay
        _razorpay_client = razorpay.Client(
            auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)
        )

    return _razorpay_client


def get_config() -> dict:
    """Return payment config for the frontend (key_id + mode)."""
    return {
        "key_id": RAZORPAY_KEY_ID or "rzp_demo_not_configured",
        "live_mode": LIVE_MODE,
        "currency": "INR",
    }


def create_order(
    db: Session,
    booking_id: int,
) -> dict:
    """
    Create a Razorpay order for a booking.

    In live mode: calls Razorpay API to create a real order.
    In demo mode: generates a fake order_id locally.

    Returns the order details needed by the frontend checkout.
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

    # Amount in paise (Razorpay uses smallest currency unit)
    amount_paise = int(booking.amount * 100)

    if LIVE_MODE:
        # Real Razorpay order
        client = _get_client()

        try:
            order = client.order.create({
                "amount": amount_paise,
                "currency": "INR",
                "receipt": f"booking_{booking_id}",
                "notes": {
                    "booking_id": str(booking_id),
                    "crane_id": booking.crane_id,
                    "customer_name": booking.customer_name,
                },
            })

            return {
                "order_id": order["id"],
                "amount": amount_paise,
                "amount_display": booking.amount,
                "currency": "INR",
                "booking_id": booking_id,
                "key_id": RAZORPAY_KEY_ID,
                "mode": "live",
                "customer_name": booking.customer_name,
                "customer_phone": booking.customer_phone or "",
                "description": f"Crane Booking #{booking_id} - {booking.crane_id}",
            }

        except Exception as exc:
            logger.error("Razorpay order creation failed: %s", exc)
            raise HTTPException(
                status_code=502,
                detail=f"Payment gateway error: {str(exc)}"
            )

    else:
        # Demo mode — simulate order creation
        demo_order_id = f"order_demo_{uuid.uuid4().hex[:16]}"

        return {
            "order_id": demo_order_id,
            "amount": amount_paise,
            "amount_display": booking.amount,
            "currency": "INR",
            "booking_id": booking_id,
            "key_id": "rzp_demo_not_configured",
            "mode": "demo",
            "customer_name": booking.customer_name,
            "customer_phone": booking.customer_phone or "",
            "description": f"Crane Booking #{booking_id} - {booking.crane_id}",
        }


def verify_payment(
    db: Session,
    booking_id: int,
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
) -> dict:
    """
    Verify a Razorpay payment after checkout completion.

    In live mode: verifies the cryptographic signature from Razorpay.
    In demo mode: accepts any payment_id starting with "pay_demo_".

    On success: marks booking as paid + confirmed, transitions crane lifecycle.
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

    # Verify signature
    if LIVE_MODE:
        client = _get_client()

        try:
            client.utility.verify_payment_signature({
                "razorpay_order_id": razorpay_order_id,
                "razorpay_payment_id": razorpay_payment_id,
                "razorpay_signature": razorpay_signature,
            })
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Payment signature verification failed"
            )

    else:
        # Demo mode — accept if payment_id looks valid
        if not razorpay_payment_id.startswith("pay_demo_"):
            raise HTTPException(
                status_code=400,
                detail="Invalid demo payment ID"
            )

    # Payment verified — update booking
    booking.payment_status = "paid"
    booking.payment_reference = razorpay_payment_id
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
        "booking_status": "confirmed",
        "payment_reference": razorpay_payment_id,
        "amount": booking.amount,
        "message": "Payment verified successfully",
        "mode": "live" if LIVE_MODE else "demo",
    }


def handle_webhook(payload: dict, signature: str) -> dict:
    """
    Handle Razorpay webhook events.

    Called by POST /payments/webhook. Razorpay sends events like
    payment.captured, payment.failed, etc.

    In production, verify the webhook signature against the webhook
    secret (different from the API secret).
    """

    if LIVE_MODE and RAZORPAY_KEY_SECRET:
        # Verify webhook signature
        expected = hmac.new(
            RAZORPAY_KEY_SECRET.encode(),
            payload.encode() if isinstance(payload, str) else str(payload).encode(),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected, signature):
            raise HTTPException(status_code=400, detail="Invalid webhook signature")

    event = payload.get("event", "")
    logger.info("Razorpay webhook received: %s", event)

    return {"status": "ok", "event": event}
