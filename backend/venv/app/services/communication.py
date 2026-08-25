"""
Communication service — chat messages and voice calls to vendors.

All external integrations (WhatsApp, SMS, Twilio, Bland.ai) are mocked
but structured so real implementations can be dropped in with minimal
changes. Each mock produces realistic-looking responses with delays
simulated on the client side.
"""

import random
import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db_models import ChatMessageDB, VoiceCallDB, VendorDB


# --------------------------------------------------
# Mock vendor responses (simulated AI / real person)
# --------------------------------------------------

_STATUS_REPLIES = [
    "Crane is on-site at Hinjewadi Phase 3. Operator reports normal operations.",
    "Currently in transit to the site. ETA 45 minutes.",
    "Maintenance complete. Crane will be back online by tomorrow morning.",
    "All good here. Working on the 4th floor lifting today.",
    "Minor hydraulic issue detected. Engineer dispatched, should be fixed in 2 hours.",
    "Crane is idle today — waiting for materials to arrive on site.",
]

_GENERAL_REPLIES = [
    "Got it, will update you shortly.",
    "Thanks for the message. I'll check with the operator.",
    "Noted. Will send photos of the site progress by EOD.",
    "Understood. I'll coordinate with the site supervisor.",
    "OK, I'll make sure the operator knows.",
]


def _generate_vendor_reply(message: str) -> str:
    """Generate a simulated vendor reply based on user message."""
    lower = message.lower()

    if any(word in lower for word in ["status", "update", "progress", "where"]):
        return random.choice(_STATUS_REPLIES)

    if any(word in lower for word in ["available", "free", "book"]):
        return "Let me check the schedule and get back to you within the hour."

    if any(word in lower for word in ["repair", "maintenance", "fix", "broken"]):
        return "I'll send our technician immediately. He should reach in about 30 minutes."

    if any(word in lower for word in ["payment", "invoice", "bill"]):
        return "Invoice has been sent to your registered email. Let me know if you need a revised one."

    return random.choice(_GENERAL_REPLIES)


# --------------------------------------------------
# Chat Messages
# --------------------------------------------------

def send_message(
    db: Session,
    vendor_id: int,
    message: str,
    channel: str = "in_app",
) -> dict:
    """
    Send a message to a vendor. Stores the user message, then
    generates a simulated vendor reply (mock WhatsApp/SMS).
    """

    vendor = db.query(VendorDB).filter(VendorDB.id == vendor_id).first()
    if vendor is None:
        raise HTTPException(status_code=404, detail="Vendor not found")

    now = datetime.utcnow()

    # Store user message
    user_msg = ChatMessageDB(
        vendor_id=vendor_id,
        sender="user",
        message=message,
        status="sent",
        channel=channel,
        timestamp=now,
    )
    db.add(user_msg)

    # Generate mock vendor reply
    reply_text = _generate_vendor_reply(message)
    vendor_msg = ChatMessageDB(
        vendor_id=vendor_id,
        sender="vendor",
        message=reply_text,
        status="delivered",
        channel=channel,
        timestamp=now,
    )
    db.add(vendor_msg)

    db.commit()
    db.refresh(user_msg)
    db.refresh(vendor_msg)

    return {
        "user_message": {
            "id": user_msg.id,
            "sender": "user",
            "message": user_msg.message,
            "channel": user_msg.channel,
            "status": user_msg.status,
            "timestamp": user_msg.timestamp.isoformat(),
        },
        "vendor_reply": {
            "id": vendor_msg.id,
            "sender": "vendor",
            "message": vendor_msg.message,
            "channel": vendor_msg.channel,
            "status": vendor_msg.status,
            "timestamp": vendor_msg.timestamp.isoformat(),
        },
    }


def get_chat_history(
    db: Session,
    vendor_id: int,
    limit: int = 50,
) -> list[dict]:
    """Return conversation thread with a vendor."""

    messages = (
        db.query(ChatMessageDB)
        .filter(ChatMessageDB.vendor_id == vendor_id)
        .order_by(ChatMessageDB.timestamp.asc())
        .limit(limit)
        .all()
    )

    return [
        {
            "id": m.id,
            "sender": m.sender,
            "message": m.message,
            "channel": m.channel,
            "status": m.status,
            "timestamp": m.timestamp.isoformat(),
        }
        for m in messages
    ]


# --------------------------------------------------
# Voice Calls (Mock — Twilio/Bland.ai ready)
# --------------------------------------------------

_CALL_TRANSCRIPTS = [
    {
        "transcript": (
            "AI: Hello, this is FleetTrack calling regarding crane CR-003 at Hinjewadi Phase 3. "
            "Can you provide a status update?\n"
            "Vendor: Yes, the crane is operational. We completed morning inspection. "
            "Currently lifting steel beams on the 5th floor.\n"
            "AI: Thank you. Any maintenance concerns?\n"
            "Vendor: The hydraulic fluid needs top-up by end of week. I'll arrange it.\n"
            "AI: Noted. Thank you for the update. Goodbye."
        ),
        "summary": "Crane operational at Hinjewadi Phase 3. Currently lifting steel on 5th floor. Hydraulic fluid top-up needed by week end — vendor will arrange.",
        "duration": 47,
    },
    {
        "transcript": (
            "AI: Hi, calling from FleetTrack. We need a status update on the crane assigned to your site.\n"
            "Vendor: Sure. The crane finished work early today. We're packing up. "
            "Will resume tomorrow at 7 AM.\n"
            "AI: Understood. Any issues to report?\n"
            "Vendor: No issues. All running smoothly.\n"
            "AI: Great, thank you. Have a good evening."
        ),
        "summary": "Crane work completed early for the day. Resuming tomorrow at 7 AM. No issues reported.",
        "duration": 32,
    },
    {
        "transcript": (
            "AI: Hello, this is an automated call from FleetTrack. "
            "We noticed the crane GPS signal dropped. Is everything okay?\n"
            "Vendor: Oh yes, we moved it inside the basement for underground work. "
            "GPS won't work there. It'll be back above ground by 4 PM.\n"
            "AI: Got it. We'll suppress the GPS alert until then. Thank you.\n"
            "Vendor: Thanks for checking."
        ),
        "summary": "GPS signal lost because crane moved to basement for underground work. Will be above ground by 4 PM. GPS alert can be suppressed.",
        "duration": 28,
    },
]


def initiate_voice_call(
    db: Session,
    vendor_id: int,
) -> dict:
    """
    Mock an AI voice call to a vendor.

    In production, this would:
    1. Call Twilio/Bland.ai API to initiate outbound call
    2. Pass a prompt/script for the AI agent
    3. Receive webhook with transcript on completion

    For now, we simulate the full lifecycle instantly.
    """

    vendor = db.query(VendorDB).filter(VendorDB.id == vendor_id).first()
    if vendor is None:
        raise HTTPException(status_code=404, detail="Vendor not found")

    mock = random.choice(_CALL_TRANSCRIPTS)
    now = datetime.utcnow()

    call = VoiceCallDB(
        vendor_id=vendor_id,
        direction="outbound",
        call_status="completed",
        duration_seconds=mock["duration"],
        transcript=mock["transcript"],
        summary=mock["summary"],
        external_call_id=f"CALL-{uuid.uuid4().hex[:10].upper()}",
        initiated_at=now,
        completed_at=now,
    )

    db.add(call)
    db.commit()
    db.refresh(call)

    return {
        "id": call.id,
        "vendor_id": call.vendor_id,
        "vendor_name": vendor.name,
        "vendor_phone": vendor.phone,
        "direction": call.direction,
        "call_status": call.call_status,
        "duration_seconds": call.duration_seconds,
        "transcript": call.transcript,
        "summary": call.summary,
        "external_call_id": call.external_call_id,
        "initiated_at": call.initiated_at.isoformat(),
        "completed_at": call.completed_at.isoformat() if call.completed_at else None,
    }


def get_call_history(
    db: Session,
    vendor_id: int | None = None,
    limit: int = 20,
) -> list[dict]:
    """Return voice call logs, optionally filtered by vendor."""

    query = db.query(VoiceCallDB)

    if vendor_id is not None:
        query = query.filter(VoiceCallDB.vendor_id == vendor_id)

    calls = (
        query.order_by(VoiceCallDB.initiated_at.desc())
        .limit(limit)
        .all()
    )

    results = []
    for c in calls:
        vendor = db.query(VendorDB).filter(VendorDB.id == c.vendor_id).first()
        results.append({
            "id": c.id,
            "vendor_id": c.vendor_id,
            "vendor_name": vendor.name if vendor else "Unknown",
            "vendor_phone": vendor.phone if vendor else "",
            "direction": c.direction,
            "call_status": c.call_status,
            "duration_seconds": c.duration_seconds,
            "transcript": c.transcript,
            "summary": c.summary,
            "external_call_id": c.external_call_id,
            "initiated_at": c.initiated_at.isoformat(),
            "completed_at": c.completed_at.isoformat() if c.completed_at else None,
        })

    return results
