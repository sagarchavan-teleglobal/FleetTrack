from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import Base, engine
from app.db_models import AlertDB, DeviceDB, EquipmentDB, GeofenceDB, TelemetryDB
from app.dependencies import get_db
from app.models import Equipment
from app.schemas import Telemetry, EquipmentCreate, DeviceCreate
from app.services.utilization import calculate_utilization
from app.services.alerts import check_alerts


app = FastAPI(
    title="Equipment Tracking POC",
    description="Tracking tractor and crane movement and utilization",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Create database tables
Base.metadata.create_all(bind=engine)


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
