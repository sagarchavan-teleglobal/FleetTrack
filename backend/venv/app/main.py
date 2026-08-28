import json
from datetime import datetime
from typing import List

from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import Base, engine
from app.db_models import AlertDB, BookingDB, ChatMessageDB, DeviceDB, EquipmentDB, GeofenceDB, TelemetryDB, VendorDB, VoiceCallDB
from app.dependencies import get_db
from app.models import Equipment
from app.schemas import (
    Telemetry, EquipmentCreate, DeviceCreate,
    VendorCreate, VendorUpdate, Vendor, VendorWithCranes,
    BookingCreate, Booking, BookingWithCrane,
    PaymentRequest, PaymentResult,
    BookingStatusUpdate,
    CraneSummary, LifecycleUpdate,
    DashboardSummary, FleetStatusCount,
)
from app.services.utilization import calculate_utilization
from app.services.alerts import check_alerts
from app.services.bookings import (
    get_available_cranes,
    create_booking,
    process_payment,
    update_booking_status,
    update_crane_lifecycle,
)
from app.services.communication import (
    send_message,
    stream_message,
    get_chat_history,
    initiate_voice_call,
    get_call_history,
)
from app.services.payment import (
    get_config as get_payment_config,
    create_order as create_payment_order,
    verify_payment,
)
from app.migrations import ensure_schema
from app.database import SessionLocal


# ─────────────────────────────────────────────
# WebSocket connection manager
# ─────────────────────────────────────────────

class ConnectionManager:
    """Manages active WebSocket connections for broadcasting."""

    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, data: dict):
        """Broadcast JSON data to all connected clients."""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(data)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.active_connections.remove(conn)


ws_manager = ConnectionManager()


app = FastAPI(
    title="Equipment Tracking POC",
    description="Tracking tractor and crane movement and utilization",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Create database tables
Base.metadata.create_all(bind=engine)

# Apply idempotent schema patches for new columns on existing tables
ensure_schema(engine)


@app.on_event("startup")
async def warm_llm():
    """
    Preload the local chat model in the background.

    The first generation on a cold model takes ~15s. Doing it here keeps the
    first user message fast. Runs in a thread so it never blocks startup, and
    a failure is non-fatal: chat falls back to static replies.
    """
    import asyncio

    from app.services import llm

    asyncio.get_event_loop().run_in_executor(None, llm.warmup)


# --------------------------------------------------
# Root
# --------------------------------------------------

@app.get("/")
def root():
    return {
        "message": "Equipment Tracking API is running"
    }


# --------------------------------------------------
# Database Test
# --------------------------------------------------

@app.get("/db-test")
def database_test():

    with engine.connect() as connection:

        result = connection.execute(
            text("SELECT current_database()")
        )

        database_name = result.scalar()

    return {
        "database": database_name,
        "status": "connected"
    }


# --------------------------------------------------
# Equipment
# --------------------------------------------------

@app.get("/equipment", response_model=list[Equipment])
def get_equipment(
    db: Session = Depends(get_db)
):

    equipment = (
        db.query(EquipmentDB)
        .all()
    )

    return equipment


@app.get(
    "/equipment/{equipment_id}",
    response_model=Equipment
)
def get_equipment_by_id(
    equipment_id: str,
    db: Session = Depends(get_db)
):

    equipment = (
        db.query(EquipmentDB)
        .filter(
            EquipmentDB.id == equipment_id
        )
        .first()
    )

    if equipment is None:
        raise HTTPException(
            status_code=404,
            detail="Equipment not found"
        )

    return equipment


# --------------------------------------------------
# Create Equipment
# --------------------------------------------------

@app.post("/equipment", response_model=Equipment)
def create_equipment(
    payload: EquipmentCreate,
    db: Session = Depends(get_db)
):

    # Check if equipment ID already exists
    existing = (
        db.query(EquipmentDB)
        .filter(EquipmentDB.id == payload.id)
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=409,
            detail="Equipment with this ID already exists"
        )

    equipment = EquipmentDB(
        id=payload.id,
        name=payload.name,
        equipment_type=payload.equipment_type,
        latitude=payload.latitude,
        longitude=payload.longitude,
        speed=0.0,
        engine_on=False,
        status="stopped"
    )

    db.add(equipment)
    db.commit()
    db.refresh(equipment)

    return equipment


# --------------------------------------------------
# Delete Equipment
# --------------------------------------------------

@app.delete("/equipment/{equipment_id}")
def delete_equipment(
    equipment_id: str,
    db: Session = Depends(get_db)
):

    equipment = (
        db.query(EquipmentDB)
        .filter(EquipmentDB.id == equipment_id)
        .first()
    )

    if equipment is None:
        raise HTTPException(
            status_code=404,
            detail="Equipment not found"
        )

    # Delete associated devices
    db.query(DeviceDB).filter(
        DeviceDB.equipment_id == equipment_id
    ).delete()

    # Delete associated telemetry
    db.query(TelemetryDB).filter(
        TelemetryDB.equipment_id == equipment_id
    ).delete()

    db.delete(equipment)
    db.commit()

    return {"message": f"Equipment {equipment_id} deleted"}


# --------------------------------------------------
# Telemetry Ingestion
# --------------------------------------------------

@app.post("/telemetry")
def receive_telemetry(
    telemetry: Telemetry,
    db: Session = Depends(get_db)
):

    # ----------------------------------------------
    # 1. Find GPS / IoT device
    # ----------------------------------------------

    device = (
        db.query(DeviceDB)
        .filter(
            DeviceDB.device_id == telemetry.device_id
        )
        .first()
    )

    if device is None:
        raise HTTPException(
            status_code=404,
            detail="Device not registered"
        )

    # ----------------------------------------------
    # 2. Update device connectivity
    # ----------------------------------------------

    device.connected = True
    device.last_seen = telemetry.timestamp
    device.signal_strength = telemetry.signal_strength

    # ----------------------------------------------
    # 3. Find equipment
    # ----------------------------------------------

    equipment = (
        db.query(EquipmentDB)
        .filter(
            EquipmentDB.id == telemetry.equipment_id
        )
        .first()
    )

    if equipment is None:
        raise HTTPException(
            status_code=404,
            detail="Equipment not found"
        )

    # ----------------------------------------------
    # 4. Determine equipment status
    # ----------------------------------------------

    if not telemetry.engine_on:

        status = "stopped"

    elif telemetry.speed < 1:

        status = "idle"

    else:

        status = "working"

    # ----------------------------------------------
    # 5. Update current equipment state
    # ----------------------------------------------

    equipment.latitude = telemetry.latitude
    equipment.longitude = telemetry.longitude
    equipment.speed = telemetry.speed
    equipment.engine_on = telemetry.engine_on
    equipment.status = status

    # ----------------------------------------------
    # 6. Store telemetry history
    # ----------------------------------------------

    telemetry_record = TelemetryDB(
        equipment_id=telemetry.equipment_id,
        device_id=telemetry.device_id,
        latitude=telemetry.latitude,
        longitude=telemetry.longitude,
        speed=telemetry.speed,
        engine_on=telemetry.engine_on,
        timestamp=telemetry.timestamp,
        signal_strength=telemetry.signal_strength,
        status=status
    )

    db.add(telemetry_record)

    # ----------------------------------------------
    # 6b. Check alert rules
    # ----------------------------------------------

    check_alerts(
        db=db,
        equipment_id=telemetry.equipment_id,
        speed=telemetry.speed,
        engine_on=telemetry.engine_on,
        signal_strength=telemetry.signal_strength,
        device=device,
        status=status,
    )

    # ----------------------------------------------
    # 7. Commit transaction
    # ----------------------------------------------

    db.commit()

    # Refresh DB objects
    db.refresh(equipment)
    db.refresh(device)
    db.refresh(telemetry_record)

    # Broadcast via WebSocket (fire-and-forget)
    import asyncio

    ws_payload = {
        "type": "telemetry",
        "equipment_id": telemetry.equipment_id,
        "device_id": telemetry.device_id,
        "latitude": telemetry.latitude,
        "longitude": telemetry.longitude,
        "speed": telemetry.speed,
        "engine_on": telemetry.engine_on,
        "status": status,
        "signal_strength": telemetry.signal_strength,
        "timestamp": telemetry.timestamp.isoformat(),
    }

    try:
        loop = asyncio.get_event_loop()
        loop.create_task(ws_manager.broadcast(ws_payload))
    except RuntimeError:
        pass  # No event loop (shouldn't happen with uvicorn)

    return {
        "message": "Telemetry stored successfully",
        "equipment": equipment,
        "device": device,
        "telemetry": telemetry_record
    }


# --------------------------------------------------
# Telemetry History
# --------------------------------------------------

@app.get(
    "/equipment/{equipment_id}/telemetry"
)
def get_telemetry_history(
    equipment_id: str,
    db: Session = Depends(get_db)
):

    records = (
        db.query(TelemetryDB)
        .filter(
            TelemetryDB.equipment_id == equipment_id
        )
        .order_by(
            TelemetryDB.timestamp.asc()
        )
        .all()
    )

    if not records:
        raise HTTPException(
            status_code=404,
            detail="No telemetry found for equipment"
        )

    return records


# --------------------------------------------------
# Equipment Utilization
# --------------------------------------------------

@app.get(
    "/equipment/{equipment_id}/utilization"
)
def get_equipment_utilization(
    equipment_id: str,
    db: Session = Depends(get_db)
):

    records = (
        db.query(TelemetryDB)
        .filter(
            TelemetryDB.equipment_id == equipment_id
        )
        .order_by(
            TelemetryDB.timestamp.asc()
        )
        .all()
    )

    if not records:

        raise HTTPException(
            status_code=404,
            detail="No telemetry found for equipment"
        )

    utilization = calculate_utilization(records)

    return {
        "equipment_id": equipment_id,
        "utilization": utilization
    }


# --------------------------------------------------
# Devices
# --------------------------------------------------

@app.get("/devices")
def get_devices(
    db: Session = Depends(get_db)
):

    devices = (
        db.query(DeviceDB)
        .all()
    )

    return devices


@app.get("/devices/{device_id}")
def get_device(
    device_id: str,
    db: Session = Depends(get_db)
):

    device = (
        db.query(DeviceDB)
        .filter(
            DeviceDB.device_id == device_id
        )
        .first()
    )

    if device is None:

        raise HTTPException(
            status_code=404,
            detail="Device not found"
        )

    return device


# --------------------------------------------------
# Create Device
# --------------------------------------------------

@app.post("/devices")
def create_device(
    payload: DeviceCreate,
    db: Session = Depends(get_db)
):

    # Check if device ID already exists
    existing = (
        db.query(DeviceDB)
        .filter(DeviceDB.device_id == payload.device_id)
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=409,
            detail="Device with this ID already exists"
        )

    # Verify equipment exists
    equipment = (
        db.query(EquipmentDB)
        .filter(EquipmentDB.id == payload.equipment_id)
        .first()
    )

    if equipment is None:
        raise HTTPException(
            status_code=404,
            detail="Equipment not found"
        )

    device = DeviceDB(
        device_id=payload.device_id,
        equipment_id=payload.equipment_id,
        connected=False,
        last_seen=None,
        signal_strength=0
    )

    db.add(device)
    db.commit()
    db.refresh(device)

    return device



# --------------------------------------------------
# Alerts
# --------------------------------------------------

@app.get("/alerts")
def get_alerts(
    limit: int = Query(default=50, le=200),
    acknowledged: bool | None = None,
    db: Session = Depends(get_db)
):
    query = db.query(AlertDB)

    if acknowledged is not None:
        query = query.filter(AlertDB.acknowledged == acknowledged)

    alerts = (
        query
        .order_by(AlertDB.timestamp.desc())
        .limit(limit)
        .all()
    )

    return alerts


@app.get("/alerts/count")
def get_alert_count(
    db: Session = Depends(get_db)
):
    unacknowledged = (
        db.query(AlertDB)
        .filter(AlertDB.acknowledged == False)
        .count()
    )

    total = db.query(AlertDB).count()

    return {
        "total": total,
        "unacknowledged": unacknowledged,
    }


@app.patch("/alerts/{alert_id}/acknowledge")
def acknowledge_alert(
    alert_id: int,
    db: Session = Depends(get_db)
):
    alert = (
        db.query(AlertDB)
        .filter(AlertDB.id == alert_id)
        .first()
    )

    if alert is None:
        raise HTTPException(
            status_code=404,
            detail="Alert not found"
        )

    alert.acknowledged = True
    db.commit()

    return {"message": "Alert acknowledged"}


@app.patch("/alerts/acknowledge-all")
def acknowledge_all_alerts(
    db: Session = Depends(get_db)
):
    db.query(AlertDB).filter(
        AlertDB.acknowledged == False
    ).update({"acknowledged": True})

    db.commit()

    return {"message": "All alerts acknowledged"}


# --------------------------------------------------
# Telemetry Export (CSV)
# --------------------------------------------------

@app.get("/equipment/{equipment_id}/telemetry/export")
def export_telemetry_csv(
    equipment_id: str,
    db: Session = Depends(get_db)
):
    records = (
        db.query(TelemetryDB)
        .filter(TelemetryDB.equipment_id == equipment_id)
        .order_by(TelemetryDB.timestamp.desc())
        .limit(1000)
        .all()
    )

    if not records:
        raise HTTPException(
            status_code=404,
            detail="No telemetry found"
        )

    import io
    import csv

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Timestamp", "Equipment ID", "Device ID",
        "Latitude", "Longitude", "Speed (km/h)",
        "Engine On", "Status", "Signal Strength (%)"
    ])

    for r in records:
        writer.writerow([
            r.timestamp.isoformat(),
            r.equipment_id,
            r.device_id,
            f"{r.latitude:.6f}",
            f"{r.longitude:.6f}",
            f"{r.speed:.2f}",
            r.engine_on,
            r.status,
            r.signal_strength,
        ])

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={equipment_id}_telemetry.csv"
        }
    )


# --------------------------------------------------
# Geofences
# --------------------------------------------------

@app.get("/geofences")
def get_geofences(
    db: Session = Depends(get_db)
):
    geofences = db.query(GeofenceDB).all()
    return geofences


@app.post("/geofences")
def create_geofence(
    name: str,
    polygon: str,
    db: Session = Depends(get_db)
):
    """
    Create a geofence zone.
    polygon should be a JSON string: [[lat,lng], [lat,lng], ...]
    """
    import json

    # Validate polygon JSON
    try:
        coords = json.loads(polygon)
        if not isinstance(coords, list) or len(coords) < 3:
            raise ValueError("Need at least 3 points")
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid polygon: {str(e)}"
        )

    geofence = GeofenceDB(
        name=name,
        polygon=polygon,
        created_at=datetime.now()
    )

    db.add(geofence)
    db.commit()
    db.refresh(geofence)

    return geofence


@app.delete("/geofences/{geofence_id}")
def delete_geofence(
    geofence_id: int,
    db: Session = Depends(get_db)
):
    geofence = (
        db.query(GeofenceDB)
        .filter(GeofenceDB.id == geofence_id)
        .first()
    )

    if geofence is None:
        raise HTTPException(
            status_code=404,
            detail="Geofence not found"
        )

    db.delete(geofence)
    db.commit()

    return {"message": f"Geofence '{geofence.name}' deleted"}


# --------------------------------------------------
# Utilization Report (date-range, per-crane daily)
# --------------------------------------------------

@app.get("/reports/utilization/{equipment_id}")
def get_utilization_report(
    equipment_id: str,
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: Session = Depends(get_db),
):
    """
    Per-crane utilization report with date range filter.
    Returns overall stats + daily breakdown for charting.
    """
    from datetime import datetime as dt, timedelta

    try:
        start = dt.fromisoformat(start_date.replace("Z", "+00:00")).replace(tzinfo=None)
        end = dt.fromisoformat(end_date.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use ISO 8601.")

    # Fetch telemetry in range
    records = (
        db.query(TelemetryDB)
        .filter(
            TelemetryDB.equipment_id == equipment_id,
            TelemetryDB.timestamp >= start,
            TelemetryDB.timestamp <= end,
        )
        .order_by(TelemetryDB.timestamp.asc())
        .all()
    )

    if not records:
        raise HTTPException(
            status_code=404,
            detail="No telemetry found for equipment in this date range"
        )

    # Overall utilization
    overall = calculate_utilization(records)

    # Daily breakdown
    daily = []
    current_day = start.replace(hour=0, minute=0, second=0, microsecond=0)
    end_day = end.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)

    while current_day < end_day:
        next_day = current_day + timedelta(days=1)
        day_records = [
            r for r in records
            if current_day <= r.timestamp < next_day
        ]

        if len(day_records) >= 2:
            day_util = calculate_utilization(day_records)
        else:
            day_util = {
                "working_seconds": 0,
                "idle_seconds": 0,
                "offline_seconds": 0,
                "total_seconds": 0,
                "uptime_percentage": 0,
                "utilization_percentage": 0,
            }

        daily.append({
            "date": current_day.strftime("%Y-%m-%d"),
            **day_util,
        })

        current_day = next_day

    # Equipment info
    equipment = (
        db.query(EquipmentDB)
        .filter(EquipmentDB.id == equipment_id)
        .first()
    )

    return {
        "equipment_id": equipment_id,
        "equipment_name": equipment.name if equipment else equipment_id,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "total_records": len(records),
        "overall": overall,
        "daily": daily,
    }


@app.get("/reports/fleet-utilization")
def get_fleet_utilization_report(
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: Session = Depends(get_db),
):
    """Fleet-wide utilization for all cranes in date range."""
    from datetime import datetime as dt

    try:
        start = dt.fromisoformat(start_date.replace("Z", "+00:00")).replace(tzinfo=None)
        end = dt.fromisoformat(end_date.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use ISO 8601.")

    cranes = (
        db.query(EquipmentDB)
        .filter(EquipmentDB.equipment_type == "crane")
        .all()
    )

    results = []
    for crane in cranes:
        records = (
            db.query(TelemetryDB)
            .filter(
                TelemetryDB.equipment_id == crane.id,
                TelemetryDB.timestamp >= start,
                TelemetryDB.timestamp <= end,
            )
            .order_by(TelemetryDB.timestamp.asc())
            .all()
        )

        if len(records) >= 2:
            util = calculate_utilization(records)
        else:
            util = {
                "working_seconds": 0,
                "idle_seconds": 0,
                "offline_seconds": 0,
                "total_seconds": 0,
                "uptime_percentage": 0,
                "utilization_percentage": 0,
            }

        results.append({
            "equipment_id": crane.id,
            "equipment_name": crane.name,
            "lifecycle_status": crane.lifecycle_status,
            "total_records": len(records),
            **util,
        })

    return {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "cranes": results,
    }


# --------------------------------------------------
# Vendors
# --------------------------------------------------

@app.get("/vendors", response_model=list[Vendor])
def get_vendors(db: Session = Depends(get_db)):
    vendors = db.query(VendorDB).order_by(VendorDB.name).all()
    return vendors


@app.get("/vendors/{vendor_id}", response_model=VendorWithCranes)
def get_vendor(vendor_id: int, db: Session = Depends(get_db)):
    vendor = db.query(VendorDB).filter(VendorDB.id == vendor_id).first()

    if vendor is None:
        raise HTTPException(status_code=404, detail="Vendor not found")

    cranes = (
        db.query(EquipmentDB)
        .filter(EquipmentDB.vendor_id == vendor_id)
        .all()
    )

    return VendorWithCranes(
        id=vendor.id,
        name=vendor.name,
        phone=vendor.phone,
        email=vendor.email,
        company=vendor.company,
        created_at=vendor.created_at,
        crane_count=len(cranes),
        cranes=[Equipment.model_validate(c, from_attributes=True) for c in cranes],
    )


@app.post("/vendors", response_model=Vendor)
def create_vendor(payload: VendorCreate, db: Session = Depends(get_db)):
    vendor = VendorDB(
        name=payload.name,
        phone=payload.phone,
        email=payload.email,
        company=payload.company,
        created_at=datetime.now(),
    )
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor


@app.patch("/vendors/{vendor_id}", response_model=Vendor)
def update_vendor(
    vendor_id: int,
    payload: VendorUpdate,
    db: Session = Depends(get_db),
):
    vendor = db.query(VendorDB).filter(VendorDB.id == vendor_id).first()

    if vendor is None:
        raise HTTPException(status_code=404, detail="Vendor not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(vendor, field, value)

    db.commit()
    db.refresh(vendor)
    return vendor


@app.delete("/vendors/{vendor_id}")
def delete_vendor(vendor_id: int, db: Session = Depends(get_db)):
    vendor = db.query(VendorDB).filter(VendorDB.id == vendor_id).first()

    if vendor is None:
        raise HTTPException(status_code=404, detail="Vendor not found")

    # Unlink cranes
    db.query(EquipmentDB).filter(
        EquipmentDB.vendor_id == vendor_id
    ).update({"vendor_id": None})

    db.delete(vendor)
    db.commit()
    return {"message": f"Vendor '{vendor.name}' deleted"}


# --------------------------------------------------
# Cranes & Lifecycle
# --------------------------------------------------

@app.get("/cranes", response_model=list[CraneSummary])
def get_cranes(db: Session = Depends(get_db)):
    """All cranes with vendor + active booking info."""

    cranes = (
        db.query(EquipmentDB)
        .filter(EquipmentDB.equipment_type == "crane")
        .all()
    )

    results = []
    for crane in cranes:
        vendor = None
        if crane.vendor_id:
            vendor_db = db.query(VendorDB).filter(VendorDB.id == crane.vendor_id).first()
            if vendor_db is not None:
                # CraneSummary.vendor is typed as the Vendor schema, not the
                # VendorDB ORM model — convert explicitly rather than
                # passing the ORM row through.
                vendor = Vendor.model_validate(vendor_db, from_attributes=True)

        active_booking = (
            db.query(BookingDB)
            .filter(
                BookingDB.crane_id == crane.id,
                BookingDB.booking_status.in_(["confirmed", "active"]),
            )
            .first()
        )

        results.append(
            CraneSummary(
                id=crane.id,
                name=crane.name,
                equipment_type=crane.equipment_type,
                latitude=crane.latitude,
                longitude=crane.longitude,
                speed=crane.speed,
                engine_on=crane.engine_on,
                status=crane.status,
                lifecycle_status=crane.lifecycle_status,
                hourly_rate=crane.hourly_rate,
                vendor=vendor,
                active_booking_id=active_booking.id if active_booking else None,
                active_booking_customer=active_booking.customer_name if active_booking else None,
            )
        )

    return results


@app.get("/cranes/available")
def get_available_cranes_endpoint(
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: Session = Depends(get_db),
):
    """Return cranes available for a given date range."""
    from datetime import datetime as dt

    try:
        start = dt.fromisoformat(start_date.replace("Z", "+00:00")).replace(tzinfo=None)
        end = dt.fromisoformat(end_date.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use ISO 8601.")

    cranes = get_available_cranes(db, start, end)
    return cranes


@app.patch("/cranes/{crane_id}/lifecycle")
def patch_crane_lifecycle(
    crane_id: str,
    payload: LifecycleUpdate,
    db: Session = Depends(get_db),
):
    """Manually override crane lifecycle (repair, deceased, available)."""
    crane = update_crane_lifecycle(db, crane_id, payload.lifecycle_status)
    return crane


# --------------------------------------------------
# Bookings
# --------------------------------------------------

@app.get("/bookings", response_model=list[BookingWithCrane])
def get_bookings(
    status: str | None = Query(default=None),
    crane_id: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
):
    """List bookings with optional status/crane filter."""

    query = db.query(BookingDB)

    if status:
        query = query.filter(BookingDB.booking_status == status)

    if crane_id:
        query = query.filter(BookingDB.crane_id == crane_id)

    bookings = (
        query.order_by(BookingDB.created_at.desc())
        .limit(limit)
        .all()
    )

    results = []
    for b in bookings:
        crane = db.query(EquipmentDB).filter(EquipmentDB.id == b.crane_id).first()
        vendor = None
        if crane and crane.vendor_id:
            v = db.query(VendorDB).filter(VendorDB.id == crane.vendor_id).first()
            vendor = v.name if v else None

        results.append(
            BookingWithCrane(
                id=b.id,
                crane_id=b.crane_id,
                customer_name=b.customer_name,
                customer_phone=b.customer_phone,
                site_address=b.site_address,
                start_date=b.start_date,
                end_date=b.end_date,
                payment_status=b.payment_status,
                booking_status=b.booking_status,
                amount=b.amount,
                payment_reference=b.payment_reference,
                created_at=b.created_at,
                crane_name=crane.name if crane else None,
                vendor_name=vendor,
            )
        )

    return results


@app.get("/bookings/{booking_id}", response_model=BookingWithCrane)
def get_booking(booking_id: int, db: Session = Depends(get_db)):
    b = db.query(BookingDB).filter(BookingDB.id == booking_id).first()

    if b is None:
        raise HTTPException(status_code=404, detail="Booking not found")

    crane = db.query(EquipmentDB).filter(EquipmentDB.id == b.crane_id).first()
    vendor = None
    if crane and crane.vendor_id:
        v = db.query(VendorDB).filter(VendorDB.id == crane.vendor_id).first()
        vendor = v.name if v else None

    return BookingWithCrane(
        id=b.id,
        crane_id=b.crane_id,
        customer_name=b.customer_name,
        customer_phone=b.customer_phone,
        site_address=b.site_address,
        start_date=b.start_date,
        end_date=b.end_date,
        payment_status=b.payment_status,
        booking_status=b.booking_status,
        amount=b.amount,
        payment_reference=b.payment_reference,
        created_at=b.created_at,
        crane_name=crane.name if crane else None,
        vendor_name=vendor,
    )


@app.post("/bookings", response_model=Booking)
def create_booking_endpoint(
    payload: BookingCreate,
    db: Session = Depends(get_db),
):
    """Create a new booking for a crane (payment still pending)."""
    booking = create_booking(
        db=db,
        crane_id=payload.crane_id,
        customer_name=payload.customer_name,
        start_date=payload.start_date,
        end_date=payload.end_date,
        customer_phone=payload.customer_phone,
        site_address=payload.site_address,
    )
    return booking


@app.post("/bookings/{booking_id}/pay", response_model=PaymentResult)
def pay_booking(
    booking_id: int,
    payload: PaymentRequest,
    db: Session = Depends(get_db),
):
    """Process mock payment for a booking."""
    result = process_payment(
        db=db,
        booking_id=booking_id,
        simulate_failure=payload.simulate_failure,
    )
    return result


@app.patch("/bookings/{booking_id}/status", response_model=Booking)
def patch_booking_status(
    booking_id: int,
    payload: BookingStatusUpdate,
    db: Session = Depends(get_db),
):
    """Transition booking status (with lifecycle side-effects)."""
    booking = update_booking_status(db, booking_id, payload.booking_status)
    return booking


# --------------------------------------------------
# Dashboard Summary (enhanced)
# --------------------------------------------------

@app.get("/dashboard/summary", response_model=DashboardSummary)
def get_dashboard_summary(db: Session = Depends(get_db)):
    """Aggregated KPIs for the enhanced dashboard."""

    all_equipment = db.query(EquipmentDB).all()
    cranes = [e for e in all_equipment if e.equipment_type == "crane"]

    # Status breakdown
    breakdown: dict[str, int] = {}
    for c in cranes:
        ls = c.lifecycle_status or "available"
        breakdown[ls] = breakdown.get(ls, 0) + 1

    status_list = [
        FleetStatusCount(lifecycle_status=k, count=v)
        for k, v in breakdown.items()
    ]

    # Bookings
    active_bookings = (
        db.query(BookingDB)
        .filter(BookingDB.booking_status.in_(["confirmed", "active"]))
        .count()
    )

    pending_payments = (
        db.query(BookingDB)
        .filter(BookingDB.payment_status == "pending")
        .count()
    )

    from sqlalchemy import func

    revenue = (
        db.query(func.coalesce(func.sum(BookingDB.amount), 0.0))
        .filter(BookingDB.payment_status == "paid")
        .scalar()
    )

    total_vendors = db.query(VendorDB).count()

    return DashboardSummary(
        total_equipment=len(all_equipment),
        total_cranes=len(cranes),
        crane_status_breakdown=status_list,
        available_cranes=breakdown.get("available", 0),
        booked_cranes=breakdown.get("booked", 0),
        working_cranes=breakdown.get("working", 0),
        repair_cranes=breakdown.get("repair", 0),
        deceased_cranes=breakdown.get("deceased", 0),
        total_vendors=total_vendors,
        active_bookings=active_bookings,
        pending_payments=pending_payments,
        revenue_collected=float(revenue),
    )


# --------------------------------------------------
# Payments (Razorpay)
# --------------------------------------------------

@app.get("/payments/config")
def get_payments_config():
    """
    Return payment gateway config for the frontend.
    Tells the frontend whether to use real Razorpay or demo mode.
    """
    return get_payment_config()


@app.post("/payments/create-order")
def create_razorpay_order(
    body: dict,
    db: Session = Depends(get_db),
):
    """
    Create a Razorpay order for a booking.
    Body: { "booking_id": 123 }

    Returns order details needed by the Razorpay checkout popup.
    """
    booking_id = body.get("booking_id")
    if not booking_id:
        raise HTTPException(status_code=400, detail="booking_id is required")

    return create_payment_order(db, booking_id)


@app.post("/payments/verify")
def verify_razorpay_payment(
    body: dict,
    db: Session = Depends(get_db),
):
    """
    Verify payment after Razorpay checkout completes.
    Body: {
        "booking_id": 123,
        "razorpay_order_id": "order_...",
        "razorpay_payment_id": "pay_...",
        "razorpay_signature": "..."
    }
    """
    required = ["booking_id", "razorpay_order_id", "razorpay_payment_id", "razorpay_signature"]
    for field in required:
        if not body.get(field):
            raise HTTPException(status_code=400, detail=f"{field} is required")

    return verify_payment(
        db=db,
        booking_id=body["booking_id"],
        razorpay_order_id=body["razorpay_order_id"],
        razorpay_payment_id=body["razorpay_payment_id"],
        razorpay_signature=body["razorpay_signature"],
    )


@app.post("/payments/webhook")
async def razorpay_webhook(request):
    """
    Razorpay webhook endpoint. Configure in Razorpay Dashboard > Webhooks.
    Events: payment.captured, payment.failed, order.paid, etc.
    """
    from starlette.requests import Request

    body = await request.json()
    signature = request.headers.get("X-Razorpay-Signature", "")
    from app.services.payment import handle_webhook
    return handle_webhook(body, signature)


# --------------------------------------------------
# Chat / Messaging
# --------------------------------------------------

@app.get("/chat/{vendor_id}")
def get_vendor_chat(
    vendor_id: int,
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
):
    """Get conversation thread with a vendor."""
    return get_chat_history(db, vendor_id, limit)


@app.post("/chat/{vendor_id}")
def send_chat_message(
    vendor_id: int,
    body: dict,
    db: Session = Depends(get_db),
):
    """
    Send a message to a vendor.
    Body: { "message": "...", "channel": "whatsapp" | "sms" | "in_app" }
    Returns both the user message and simulated vendor reply.
    """
    message = body.get("message", "").strip()
    channel = body.get("channel", "in_app")

    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    return send_message(db, vendor_id, message, channel)


@app.post("/chat/{vendor_id}/stream")
def send_chat_message_stream(
    vendor_id: int,
    body: dict,
):
    """
    Same as POST /chat/{vendor_id}, but streams the vendor's reply as
    Server-Sent Events so the UI can render tokens as they are generated
    instead of waiting for the full response.

    Event payloads (JSON-encoded per SSE `data:` line):
        {"type": "user_message", "message": {...}}
        {"type": "token", "content": "..."}
        {"type": "done", "vendor_reply": {...}, "generated_by": "llm"|"fallback"}
        {"type": "error", "detail": "..."}

    Uses its own DB session because the request-scoped `get_db` session
    closes as soon as this function returns, before the generator (which
    runs lazily as StreamingResponse iterates it) has done any work.
    """
    message = body.get("message", "").strip()
    channel = body.get("channel", "in_app")

    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    def event_source():
        db = SessionLocal()
        try:
            for event in stream_message(db, vendor_id, message, channel):
                yield f"data: {json.dumps(event)}\n\n"
        except HTTPException as exc:
            yield f"data: {json.dumps({'type': 'error', 'detail': exc.detail})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'detail': str(exc)})}\n\n"
        finally:
            db.close()

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/chat/{vendor_id}/quick-action")
def chat_quick_action(
    vendor_id: int,
    body: dict,
    db: Session = Depends(get_db),
):
    """
    Pre-built quick actions. Body: { "action": "status_update" | "eta" | "maintenance" }
    """
    action = body.get("action", "status_update")

    templates = {
        "status_update": "Hi, can you please provide a status update on the crane currently deployed at your site?",
        "eta": "When will the crane arrive at the site? Please share the ETA.",
        "maintenance": "We need to schedule maintenance for the crane. When is a good time?",
        "payment_reminder": "This is a reminder regarding the pending payment for the latest booking. Please update.",
    }

    message = templates.get(action, templates["status_update"])
    return send_message(db, vendor_id, message, "whatsapp")


# --------------------------------------------------
# Voice Calls (AI Voicebot)
# --------------------------------------------------

@app.post("/voice/call/{vendor_id}")
def call_vendor(
    vendor_id: int,
    db: Session = Depends(get_db),
):
    """
    Initiate an AI voice call to a vendor.

    Architecture is ready for Twilio/Bland.ai integration:
    - Replace mock in services/communication.py with real API call
    - Add webhook endpoint for call completion + transcript
    - Store external_call_id for tracking

    Currently returns a simulated completed call with transcript.
    """
    return initiate_voice_call(db, vendor_id)


@app.get("/voice/calls")
def get_voice_calls(
    vendor_id: int | None = Query(default=None),
    limit: int = Query(default=20, le=100),
    db: Session = Depends(get_db),
):
    """Get voice call history, optionally filtered by vendor."""
    return get_call_history(db, vendor_id, limit)


# --------------------------------------------------
# AI / LLM Status
# --------------------------------------------------

@app.get("/ai/status")
def get_ai_status():
    """
    Report which engine is driving chat replies and call transcripts.

    When `available` is false the app falls back to static keyword replies,
    so chat and voice keep working without the model.
    """
    from app.services import llm

    return llm.model_info()


# --------------------------------------------------
# WebSocket - Real-time telemetry stream
# --------------------------------------------------

@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    """
    WebSocket endpoint for real-time telemetry updates.
    Clients connect here to receive live equipment position updates
    without polling.
    """
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive; we only send from broadcast
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
