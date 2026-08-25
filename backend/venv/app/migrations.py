"""
Lightweight schema migrations for the POC.

`Base.metadata.create_all()` creates missing *tables* but never alters
existing ones. Because the `equipment` table already exists in running
environments, the new booking-related columns have to be added
explicitly. This module is intentionally simple (idempotent DDL, no
version tracking) and should be replaced by Alembic if this project
grows past POC scope.
"""

from sqlalchemy import text
from sqlalchemy.engine import Engine


# (table, column, DDL type + default)
_ADD_COLUMNS = [
    (
        "equipment",
        "lifecycle_status",
        "VARCHAR(20) NOT NULL DEFAULT 'available'",
    ),
    (
        "equipment",
        "vendor_id",
        "INTEGER",
    ),
    (
        "equipment",
        "hourly_rate",
        "DOUBLE PRECISION NOT NULL DEFAULT 0",
    ),
]


_ADD_CONSTRAINTS = [
    (
        "equipment",
        "fk_equipment_vendor_id",
        "FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL",
    ),
]


def ensure_schema(engine: Engine) -> None:
    """Apply idempotent schema patches. Safe to call on every startup."""

    with engine.begin() as connection:

        for table, column, definition in _ADD_COLUMNS:

            connection.execute(
                text(
                    f"ALTER TABLE {table} "
                    f"ADD COLUMN IF NOT EXISTS {column} {definition}"
                )
            )

        for table, constraint, definition in _ADD_CONSTRAINTS:

            exists = connection.execute(
                text(
                    "SELECT 1 FROM pg_constraint WHERE conname = :name"
                ),
                {"name": constraint},
            ).scalar()

            if exists is None:

                connection.execute(
                    text(
                        f"ALTER TABLE {table} "
                        f"ADD CONSTRAINT {constraint} {definition}"
                    )
                )

        # Backfill any rows that predate the column default.
        connection.execute(
            text(
                "UPDATE equipment "
                "SET lifecycle_status = 'available' "
                "WHERE lifecycle_status IS NULL"
            )
        )
