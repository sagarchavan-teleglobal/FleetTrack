"""
Comprehensive integration test suite for the FleetTrack POC backend.

Runs against the LIVE backend at localhost:8000. Requires:
  - Backend running (uvicorn app.main:app)
  - PostgreSQL running on port 5433
  - Seeded data (python seed.py)

Usage:
    cd backend
    python -m pytest tests/test_api.py -v

These are integration tests, not unit tests. They hit the real DB and real
model (if Ollama is running). They are designed to verify correctness of all
API endpoints in a demo-ready state.
"""

import time

import httpx
import pytest

BASE_URL = "http://localhost:8000"


@pytest.fixture(scope="session")
def client():
    """Shared HTTP client for all tests."""
    with httpx.Client(base_url=BASE_URL, timeout=60.0) as c:
        yield c


# ══════════════════════════════════════════════════
# Health / Root
# ══════════════════════════════════════════════════


class TestHealth:
    def test_root(self, client):
        r = client.get("/")
        assert r.status_code == 200
        assert "running" in r.json()["message"].lower()

    def test_db_connection(self, client):
        r = client.get("/db-test")
        assert r.status_code == 200
        assert r.json()["status"] == "connected"


# ══════════════════════════════════════════════════
# Equipment CRUD
# ══════════════════════════════════════════════════


class TestEquipment:
    def test_list_equipment(self, client):
        r = client.get("/equipment")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 5  # seed creates 5 cranes + 1 tractor

    def test_get_equipment_by_id(self, client):
        r = client.get("/equipment/CR-001")
        assert r.status_code == 200
        eq = r.json()
        assert eq["id"] == "CR-001"
        assert eq["equipment_type"] == "crane"
        assert "lifecycle_status" in eq

    def test_get_equipment_not_found(self, client):
        r = client.get("/equipment/NONEXISTENT-999")
        assert r.status_code == 404

    def test_create_and_delete_equipment(self, client):
        payload = {
            "id": "TEST-E2E-001",
            "name": "Test Crane E2E",
            "equipment_type": "crane",
            "latitude": 18.52,
            "longitude": 73.85,
        }
        # Create
        r = client.post("/equipment", json=payload)
        assert r.status_code == 200
        assert r.json()["id"] == "TEST-E2E-001"

        # Verify it exists
        r = client.get("/equipment/TEST-E2E-001")
        assert r.status_code == 200

        # Delete
        r = client.delete("/equipment/TEST-E2E-001")
        assert r.status_code == 200

        # Verify it's gone
        r = client.get("/equipment/TEST-E2E-001")
        assert r.status_code == 404

    def test_create_duplicate_equipment(self, client):
        r = client.post("/equipment", json={
            "id": "CR-001",
            "name": "Duplicate",
            "equipment_type": "crane",
            "latitude": 0,
            "longitude": 0,
        })
        assert r.status_code == 409


# ══════════════════════════════════════════════════
# Devices
# ══════════════════════════════════════════════════


class TestDevices:
    def test_list_devices(self, client):
        r = client.get("/devices")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 6

    def test_get_device(self, client):
        r = client.get("/devices/GPS-CR-001")
        assert r.status_code == 200
        assert r.json()["equipment_id"] == "CR-001"

    def test_device_not_found(self, client):
        r = client.get("/devices/FAKE-DEVICE")
        assert r.status_code == 404


# ══════════════════════════════════════════════════
# Vendors CRUD
# ══════════════════════════════════════════════════


class TestVendors:
    def test_list_vendors(self, client):
        r = client.get("/vendors")
        assert r.status_code == 200
        vendors = r.json()
        assert len(vendors) >= 3

    def test_get_vendor_with_cranes(self, client):
        r = client.get("/vendors/1")
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Rajesh Sharma"
        assert "crane_count" in data
        assert "cranes" in data
        assert data["crane_count"] >= 2

    def test_create_update_delete_vendor(self, client):
        # Create
        r = client.post("/vendors", json={
            "name": "Test Vendor",
            "phone": "+91-0000000000",
            "email": "test@test.com",
            "company": "Test Corp",
        })
        assert r.status_code == 200
        vendor_id = r.json()["id"]

        # Update
        r = client.patch(f"/vendors/{vendor_id}", json={"phone": "+91-1111111111"})
        assert r.status_code == 200
        assert r.json()["phone"] == "+91-1111111111"

        # Delete
        r = client.delete(f"/vendors/{vendor_id}")
        assert r.status_code == 200

    def test_vendor_not_found(self, client):
        r = client.get("/vendors/99999")
        assert r.status_code == 404


# ══════════════════════════════════════════════════
# Cranes & Lifecycle
# ══════════════════════════════════════════════════


class TestCranes:
    def test_list_cranes(self, client):
        r = client.get("/cranes")
        assert r.status_code == 200
        cranes = r.json()
        assert len(cranes) >= 5
        # Each crane should have vendor info
        for crane in cranes:
            assert "lifecycle_status" in crane
            assert "hourly_rate" in crane

    def test_cranes_have_vendor_nested(self, client):
        r = client.get("/cranes")
        assert r.status_code == 200
        cr001 = next(c for c in r.json() if c["id"] == "CR-001")
        assert cr001["vendor"] is not None
        assert cr001["vendor"]["name"] == "Rajesh Sharma"

    def test_available_cranes(self, client):
        r = client.get("/cranes/available", params={
            "start_date": "2030-01-01T00:00:00Z",
            "end_date": "2030-01-05T00:00:00Z",
        })
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_available_cranes_bad_date(self, client):
        r = client.get("/cranes/available", params={
            "start_date": "not-a-date",
            "end_date": "also-not",
        })
        assert r.status_code == 400

    def test_lifecycle_update(self, client):
        # Set CR-005 to repair
        r = client.patch("/cranes/CR-005/lifecycle", json={
            "lifecycle_status": "repair",
        })
        assert r.status_code == 200

        # Verify
        r = client.get("/cranes")
        cr005 = next(c for c in r.json() if c["id"] == "CR-005")
        assert cr005["lifecycle_status"] == "repair"

        # Set back to available
        r = client.patch("/cranes/CR-005/lifecycle", json={
            "lifecycle_status": "available",
        })
        assert r.status_code == 200

    def test_lifecycle_update_not_found(self, client):
        r = client.patch("/cranes/FAKE-ID/lifecycle", json={
            "lifecycle_status": "repair",
        })
        assert r.status_code == 404


# ══════════════════════════════════════════════════
# Bookings
# ══════════════════════════════════════════════════


class TestBookings:
    def test_list_bookings(self, client):
        r = client.get("/bookings")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_full_booking_lifecycle(self, client):
        """Create -> Pay -> Start Work -> Complete"""
        # Create booking
        r = client.post("/bookings", json={
            "crane_id": "CR-002",
            "customer_name": "E2E Test Customer",
            "customer_phone": "+91-9999999999",
            "site_address": "Test Site, Pune",
            "start_date": "2030-06-01T09:00:00Z",
            "end_date": "2030-06-03T18:00:00Z",
        })
        assert r.status_code == 200
        booking = r.json()
        booking_id = booking["id"]
        assert booking["booking_status"] == "pending"
        assert booking["payment_status"] == "pending"
        assert booking["amount"] > 0

        # Pay
        r = client.post(f"/bookings/{booking_id}/pay", json={
            "method": "card",
            "simulate_failure": False,
        })
        assert r.status_code == 200
        pay_result = r.json()
        assert pay_result["payment_status"] == "paid"
        assert pay_result["booking_status"] == "confirmed"
        assert pay_result["payment_reference"] is not None

        # Start work
        r = client.patch(f"/bookings/{booking_id}/status", json={
            "booking_status": "active",
        })
        assert r.status_code == 200
        assert r.json()["booking_status"] == "active"

        # Complete
        r = client.patch(f"/bookings/{booking_id}/status", json={
            "booking_status": "completed",
        })
        assert r.status_code == 200
        assert r.json()["booking_status"] == "completed"

    def test_booking_payment_failure(self, client):
        # Create booking
        r = client.post("/bookings", json={
            "crane_id": "CR-001",
            "customer_name": "Fail Test",
            "start_date": "2031-01-01T00:00:00Z",
            "end_date": "2031-01-02T00:00:00Z",
        })
        assert r.status_code == 200
        booking_id = r.json()["id"]

        # Simulate payment failure
        r = client.post(f"/bookings/{booking_id}/pay", json={
            "method": "card",
            "simulate_failure": True,
        })
        assert r.status_code == 200
        assert r.json()["payment_status"] == "failed"

        # Cancel this test booking
        r = client.patch(f"/bookings/{booking_id}/status", json={
            "booking_status": "cancelled",
        })
        assert r.status_code == 200

    def test_booking_invalid_transition(self, client):
        r = client.post("/bookings", json={
            "crane_id": "CR-001",
            "customer_name": "Transition Test",
            "start_date": "2032-01-01T00:00:00Z",
            "end_date": "2032-01-02T00:00:00Z",
        })
        booking_id = r.json()["id"]

        # Try to go directly from pending to active (should fail)
        r = client.patch(f"/bookings/{booking_id}/status", json={
            "booking_status": "active",
        })
        assert r.status_code == 409

        # Cleanup
        r = client.patch(f"/bookings/{booking_id}/status", json={
            "booking_status": "cancelled",
        })
        assert r.status_code == 200

    def test_booking_date_validation(self, client):
        # end_date before start_date
        r = client.post("/bookings", json={
            "crane_id": "CR-001",
            "customer_name": "Bad Dates",
            "start_date": "2030-06-05T00:00:00Z",
            "end_date": "2030-06-01T00:00:00Z",
        })
        assert r.status_code == 422  # Pydantic validation error

    def test_booking_not_found(self, client):
        r = client.get("/bookings/999999")
        assert r.status_code == 404

    def test_booking_filter_by_status(self, client):
        r = client.get("/bookings", params={"status": "confirmed"})
        assert r.status_code == 200
        for b in r.json():
            assert b["booking_status"] == "confirmed"


# ══════════════════════════════════════════════════
# Dashboard
# ══════════════════════════════════════════════════


class TestDashboard:
    def test_dashboard_summary(self, client):
        r = client.get("/dashboard/summary")
        assert r.status_code == 200
        data = r.json()
        assert "total_equipment" in data
        assert "total_cranes" in data
        assert "crane_status_breakdown" in data
        assert "available_cranes" in data
        assert "revenue_collected" in data
        assert data["total_cranes"] >= 5
        assert isinstance(data["crane_status_breakdown"], list)


# ══════════════════════════════════════════════════
# Alerts
# ══════════════════════════════════════════════════


class TestAlerts:
    def test_list_alerts(self, client):
        r = client.get("/alerts")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_alert_count(self, client):
        r = client.get("/alerts/count")
        assert r.status_code == 200
        data = r.json()
        assert "total" in data
        assert "unacknowledged" in data

    def test_acknowledge_all(self, client):
        r = client.patch("/alerts/acknowledge-all")
        assert r.status_code == 200


# ══════════════════════════════════════════════════
# Geofences
# ══════════════════════════════════════════════════


class TestGeofences:
    def test_list_geofences(self, client):
        r = client.get("/geofences")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ══════════════════════════════════════════════════
# Utilization Reports
# ══════════════════════════════════════════════════


class TestReports:
    def test_fleet_utilization(self, client):
        r = client.get("/reports/fleet-utilization", params={
            "start_date": "2026-08-25T00:00:00Z",
            "end_date": "2026-08-27T00:00:00Z",
        })
        assert r.status_code == 200
        data = r.json()
        assert "cranes" in data
        assert isinstance(data["cranes"], list)

    def test_equipment_utilization_no_data(self, client):
        # Far future date range - no telemetry exists
        r = client.get("/reports/utilization/CR-001", params={
            "start_date": "2099-01-01T00:00:00Z",
            "end_date": "2099-01-02T00:00:00Z",
        })
        assert r.status_code == 404


# ══════════════════════════════════════════════════
# Chat / Communication
# ══════════════════════════════════════════════════


class TestChat:
    def test_get_chat_history_empty(self, client):
        r = client.get("/chat/3")  # vendor 3 likely has no chat
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_send_message(self, client):
        r = client.post("/chat/1", json={
            "message": "Test message from integration test",
            "channel": "in_app",
        })
        assert r.status_code == 200
        data = r.json()
        assert "user_message" in data
        assert "vendor_reply" in data
        assert data["user_message"]["sender"] == "user"
        assert data["vendor_reply"]["sender"] == "vendor"
        assert "generated_by" in data
        assert data["generated_by"] in ("llm", "fallback")

    def test_send_empty_message(self, client):
        r = client.post("/chat/1", json={
            "message": "   ",
            "channel": "in_app",
        })
        assert r.status_code == 400

    def test_send_message_vendor_not_found(self, client):
        r = client.post("/chat/99999", json={
            "message": "Hello",
            "channel": "in_app",
        })
        assert r.status_code == 404

    def test_quick_action(self, client):
        r = client.post("/chat/1/quick-action", json={
            "action": "status_update",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["user_message"]["sender"] == "user"
        assert data["vendor_reply"]["sender"] == "vendor"

    def test_stream_endpoint(self, client):
        """Test SSE streaming endpoint returns valid events."""
        with httpx.stream(
            "POST",
            f"{BASE_URL}/chat/1/stream",
            json={"message": "Quick test", "channel": "in_app"},
            timeout=60.0,
        ) as response:
            assert response.status_code == 200
            assert "text/event-stream" in response.headers["content-type"]

            events = []
            for line in response.iter_lines():
                if line.startswith("data:"):
                    import json
                    event = json.loads(line[5:].strip())
                    events.append(event)

            # Should have at least: user_message, 1+ tokens, done
            types = [e["type"] for e in events]
            assert "user_message" in types
            assert "done" in types
            # Either tokens (LLM) or a single token (fallback)
            assert "token" in types


# ══════════════════════════════════════════════════
# Voice Calls
# ══════════════════════════════════════════════════


class TestVoiceCalls:
    def test_call_vendor(self, client):
        r = client.post("/voice/call/1")
        assert r.status_code == 200
        data = r.json()
        assert data["call_status"] == "completed"
        assert data["vendor_name"] == "Rajesh Sharma"
        assert data["transcript"] is not None
        assert data["summary"] is not None
        assert data["duration_seconds"] > 0
        assert data["external_call_id"] is not None
        assert "generated_by" in data

    def test_call_vendor_not_found(self, client):
        r = client.post("/voice/call/99999")
        assert r.status_code == 404

    def test_get_call_history(self, client):
        r = client.get("/voice/calls")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_call_history_filtered(self, client):
        r = client.get("/voice/calls", params={"vendor_id": 1})
        assert r.status_code == 200
        for call in r.json():
            assert call["vendor_id"] == 1


# ══════════════════════════════════════════════════
# AI Status
# ══════════════════════════════════════════════════


class TestAiStatus:
    def test_ai_status(self, client):
        r = client.get("/ai/status")
        assert r.status_code == 200
        data = r.json()
        assert data["provider"] == "ollama"
        assert "model" in data
        assert "available" in data
        assert isinstance(data["available"], bool)


# ══════════════════════════════════════════════════
# Telemetry Ingestion
# ══════════════════════════════════════════════════


class TestTelemetry:
    def test_ingest_telemetry(self, client):
        payload = {
            "equipment_id": "CR-001",
            "device_id": "GPS-CR-001",
            "latitude": 18.5220,
            "longitude": 73.8600,
            "speed": 5.5,
            "engine_on": True,
            "timestamp": "2026-08-26T12:00:00Z",
            "signal_strength": 85,
        }
        r = client.post("/telemetry", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["message"] == "Telemetry stored successfully"

    def test_ingest_telemetry_unknown_device(self, client):
        payload = {
            "equipment_id": "CR-001",
            "device_id": "FAKE-DEVICE-999",
            "latitude": 18.52,
            "longitude": 73.86,
            "speed": 0,
            "engine_on": False,
            "timestamp": "2026-08-26T12:00:00Z",
            "signal_strength": 50,
        }
        r = client.post("/telemetry", json=payload)
        assert r.status_code == 404

    def test_telemetry_history(self, client):
        r = client.get("/equipment/CR-001/telemetry")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0

    def test_telemetry_export_csv(self, client):
        r = client.get("/equipment/CR-001/telemetry/export")
        assert r.status_code == 200
        assert "text/csv" in r.headers["content-type"]
        assert "Timestamp" in r.text

    def test_utilization(self, client):
        r = client.get("/equipment/CR-001/utilization")
        assert r.status_code == 200
        data = r.json()
        assert "utilization" in data
        assert "working_seconds" in data["utilization"]
