from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import Base, engine
from app.db_models import DeviceDB, EquipmentDB, TelemetryDB
from app.dependencies import get_db
from app.models import Equipment
from app.schemas import Telemetry
from app.services.utilization import calculate_utilization


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


