from datetime import datetime

from app.database import SessionLocal
from app.db_models import DeviceDB, EquipmentDB


def seed_database():

    db = SessionLocal()

    try:

        # -----------------------------
        # Equipment
        # -----------------------------

        equipment = [
            EquipmentDB(
                id="TR-001",
                name="Tractor 001",
                equipment_type="tractor",
                latitude=18.5204,
                longitude=73.8567,
                speed=0.0,
                engine_on=False,
                status="stopped"
            ),
            EquipmentDB(
                id="CR-001",
                name="Crane 001",
                equipment_type="crane",
                latitude=18.5212,
                longitude=73.8581,
                speed=0.0,
                engine_on=False,
                status="stopped"
            )
        ]

        for item in equipment:

            existing = (
                db.query(EquipmentDB)
                .filter(
                    EquipmentDB.id == item.id
                )
                .first()
            )

            if existing is None:
                db.add(item)

        db.commit()

        # -----------------------------
        # Devices
        # -----------------------------

        devices = [
            DeviceDB(
                device_id="GPS-TR-001",
                equipment_id="TR-001",
                connected=False,
                last_seen=None,
                signal_strength=0
            ),
            DeviceDB(
                device_id="GPS-CR-001",
                equipment_id="CR-001",
                connected=False,
                last_seen=None,
                signal_strength=0
            )
        ]

        for item in devices:

            existing = (
                db.query(DeviceDB)
                .filter(
                    DeviceDB.device_id == item.device_id
                )
                .first()
            )

            if existing is None:
                db.add(item)

        db.commit()

        print("Database seeded successfully.")

    finally:

        db.close()


if __name__ == "__main__":
    seed_database()