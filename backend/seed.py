from datetime import datetime, timedelta

from app.database import SessionLocal
from app.db_models import BookingDB, DeviceDB, EquipmentDB, VendorDB


def seed_database():

    db = SessionLocal()

    try:

        # -----------------------------
        # Vendors
        # -----------------------------

        vendors = [
            VendorDB(
                id=1,
                name="Rajesh Sharma",
                phone="+91-9876543210",
                email="rajesh@sharmaconstructions.in",
                company="Sharma Heavy Constructions",
                created_at=datetime(2024, 1, 15),
            ),
            VendorDB(
                id=2,
                name="Priya Mehta",
                phone="+91-9123456789",
                email="priya@mehtacranes.in",
                company="Mehta Crane Services",
                created_at=datetime(2024, 2, 1),
            ),
            VendorDB(
                id=3,
                name="Anil Kulkarni",
                phone="+91-9988776655",
                email="anil@kulkarniheavy.in",
                company="Kulkarni Heavy Equipments Pvt Ltd",
                created_at=datetime(2024, 3, 10),
            ),
        ]

        for item in vendors:
            existing = (
                db.query(VendorDB)
                .filter(VendorDB.id == item.id)
                .first()
            )
            if existing is None:
                db.add(item)

        db.commit()

        # -----------------------------
        # Equipment (tractors + cranes)
        # -----------------------------

        equipment = [
            # Tractors
            EquipmentDB(
                id="TR-001",
                name="Tractor 001",
                equipment_type="tractor",
                latitude=18.5204,
                longitude=73.8567,
                speed=0.0,
                engine_on=False,
                status="stopped",
                lifecycle_status="available",
                vendor_id=None,
                hourly_rate=0,
            ),
            # Cranes
            EquipmentDB(
                id="CR-001",
                name="Tower Crane Alpha",
                equipment_type="crane",
                latitude=18.5212,
                longitude=73.8581,
                speed=0.0,
                engine_on=False,
                status="stopped",
                lifecycle_status="available",
                vendor_id=1,
                hourly_rate=2500.0,
            ),
            EquipmentDB(
                id="CR-002",
                name="Mobile Crane Beta",
                equipment_type="crane",
                latitude=18.5250,
                longitude=73.8620,
                speed=0.0,
                engine_on=False,
                status="stopped",
                lifecycle_status="available",
                vendor_id=1,
                hourly_rate=1800.0,
            ),
            EquipmentDB(
                id="CR-003",
                name="Crawler Crane Gamma",
                equipment_type="crane",
                latitude=18.5180,
                longitude=73.8540,
                speed=0.0,
                engine_on=False,
                status="stopped",
                lifecycle_status="available",
                vendor_id=2,
                hourly_rate=3200.0,
            ),
            EquipmentDB(
                id="CR-004",
                name="Hydraulic Crane Delta",
                equipment_type="crane",
                latitude=18.5300,
                longitude=73.8500,
                speed=0.0,
                engine_on=False,
                status="stopped",
                lifecycle_status="repair",
                vendor_id=2,
                hourly_rate=2100.0,
            ),
            EquipmentDB(
                id="CR-005",
                name="Telescopic Crane Epsilon",
                equipment_type="crane",
                latitude=18.5150,
                longitude=73.8650,
                speed=0.0,
                engine_on=False,
                status="stopped",
                lifecycle_status="available",
                vendor_id=3,
                hourly_rate=2800.0,
            ),
        ]

        for item in equipment:
            existing = (
                db.query(EquipmentDB)
                .filter(EquipmentDB.id == item.id)
                .first()
            )
            if existing is None:
                db.add(item)
            else:
                # Update existing rows with new fields
                existing.lifecycle_status = item.lifecycle_status
                existing.vendor_id = item.vendor_id
                existing.hourly_rate = item.hourly_rate
                if item.name != existing.name:
                    existing.name = item.name

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
                signal_strength=0,
            ),
            DeviceDB(
                device_id="GPS-CR-001",
                equipment_id="CR-001",
                connected=False,
                last_seen=None,
                signal_strength=0,
            ),
            DeviceDB(
                device_id="GPS-CR-002",
                equipment_id="CR-002",
                connected=False,
                last_seen=None,
                signal_strength=0,
            ),
            DeviceDB(
                device_id="GPS-CR-003",
                equipment_id="CR-003",
                connected=False,
                last_seen=None,
                signal_strength=0,
            ),
            DeviceDB(
                device_id="GPS-CR-004",
                equipment_id="CR-004",
                connected=False,
                last_seen=None,
                signal_strength=0,
            ),
            DeviceDB(
                device_id="GPS-CR-005",
                equipment_id="CR-005",
                connected=False,
                last_seen=None,
                signal_strength=0,
            ),
        ]

        for item in devices:
            existing = (
                db.query(DeviceDB)
                .filter(DeviceDB.device_id == item.device_id)
                .first()
            )
            if existing is None:
                db.add(item)

        db.commit()

        # -----------------------------
        # Sample Booking (already paid)
        # -----------------------------

        existing_booking = (
            db.query(BookingDB)
            .filter(BookingDB.crane_id == "CR-003")
            .first()
        )

        if existing_booking is None:
            now = datetime.utcnow()
            booking = BookingDB(
                crane_id="CR-003",
                customer_name="Metro Construction Corp",
                customer_phone="+91-8877665544",
                site_address="Hinjewadi Phase 3, Pune",
                start_date=now + timedelta(days=2),
                end_date=now + timedelta(days=12),
                payment_status="paid",
                booking_status="confirmed",
                amount=3200.0 * 240,  # 10 days * 24h * rate
                payment_reference="PAY-SEED00000001",
                created_at=now,
            )
            db.add(booking)

            # Move crane to booked
            crane = (
                db.query(EquipmentDB)
                .filter(EquipmentDB.id == "CR-003")
                .first()
            )
            if crane:
                crane.lifecycle_status = "booked"

            db.commit()

        print("Database seeded successfully.")
        print(f"  - {len(vendors)} vendors")
        print(f"  - {len(equipment)} equipment items ({sum(1 for e in equipment if e.equipment_type == 'crane')} cranes)")
        print(f"  - {len(devices)} GPS devices")
        print(f"  - 1 sample booking")

    finally:

        db.close()


if __name__ == "__main__":
    seed_database()