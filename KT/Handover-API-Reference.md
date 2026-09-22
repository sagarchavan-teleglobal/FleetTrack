# Handover — API Reference

**Base URL (local):** `http://localhost:8000`
**Interactive docs:** `http://localhost:8000/docs` (Swagger), `/redoc` (ReDoc)
**Content type:** `application/json` unless noted.

All routes are defined in `backend/venv/app/main.py`. This reference lists every
endpoint with method, path, purpose, and payload notes.

---

## System / Health

### GET `/`
Health check. → `{"message": "Equipment Tracking API is running"}`

### GET `/db-test`
DB connectivity. → `{"database": "fleet_tracking", "status": "connected"}`

### GET `/ai/status`
Active LLM provider/model.
→ `{"provider":"groq"|"ollama", "model":"...", "host":"...", "available":true}`

---

## Equipment

### GET `/equipment`
List all equipment (current state). → `Equipment[]`

### GET `/equipment/{equipment_id}`
One machine. → `Equipment` | 404

### POST `/equipment`
Create equipment.
Body (`EquipmentCreate`):
```json
{ "id":"CR-010","name":"Crane 10","equipment_type":"crane",
  "latitude":18.52,"longitude":73.85,"vendor_id":1,"hourly_rate":1500 }
```
`equipment_type` ∈ tractor|crane|excavator|dumper. → `Equipment`

### DELETE `/equipment/{equipment_id}`
Delete a machine (also removes its devices/telemetry). → `{message}` | 404

---

## Telemetry

### POST `/telemetry`
Ingest a GPS reading. Body (`Telemetry`):
```json
{ "equipment_id":"CR-001","device_id":"GPS-CR-001",
  "latitude":18.52,"longitude":73.85,"speed":6.4,"engine_on":true,
  "timestamp":"2025-01-01T10:00:00Z","signal_strength":82 }
```
Derives status, updates state, stores history, runs alerts, broadcasts on WS.
→ stored record | 404 (unknown device/equipment)

### GET `/equipment/{equipment_id}/telemetry`
Telemetry history (chronological). → `TelemetryRecord[]`

### GET `/equipment/{equipment_id}/telemetry/export`
CSV download of telemetry history. → `text/csv`

### GET `/equipment/{equipment_id}/utilization`
Utilization for one machine (all-time).
→ `{ working_seconds, idle_seconds, offline_seconds, total_seconds,
     uptime_percentage, utilization_percentage }`

### WebSocket `/ws/telemetry`
Server pushes live telemetry updates to connected clients (the map). Clients
receive JSON telemetry/broadcast messages; no request body.

---

## Devices

### GET `/devices`
List GPS devices. → `Device[]`

### GET `/devices/{device_id}`
One device. → `Device` | 404

### POST `/devices`
Register a device to equipment. Body (`DeviceCreate`):
```json
{ "device_id":"GPS-CR-010","equipment_id":"CR-010" }
```

---

## Alerts

### GET `/alerts?acknowledged={bool}`
List alerts, optionally filtered. → `Alert[]`

### GET `/alerts/count`
→ `{ "total": n, "unacknowledged": m }`

### PATCH `/alerts/{alert_id}/acknowledge`
Acknowledge one alert. → `{message}` | 404

### PATCH `/alerts/acknowledge-all`
Acknowledge all. → `{message}`

---

## Geofences

### GET `/geofences`
List zones. → `Geofence[]`

### POST `/geofences`
Create a zone. Body:
```json
{ "name":"Site A", "polygon":"[[18.52,73.85],[18.53,73.86],[18.52,73.87]]" }
```

### DELETE `/geofences/{geofence_id}`
Delete a zone. → `{message}` | 404

---

## Vendors

### GET `/vendors`
List vendors. → `Vendor[]`

### GET `/vendors/{vendor_id}`
Vendor + their cranes. → `VendorWithCranes` | 404

### POST `/vendors`
Create. Body (`VendorCreate`):
```json
{ "name":"Rajesh Sharma","phone":"+91...","email":"a@b.com","company":"Sharma Cranes" }
```

### PATCH `/vendors/{vendor_id}`
Partial update (`VendorUpdate`). Any subset of name/phone/email/company.

### DELETE `/vendors/{vendor_id}`
Delete vendor. → `{message}` | 404

---

## Cranes

### GET `/cranes`
Cranes enriched with vendor + active-booking context. → `CraneSummary[]`

### GET `/cranes/available?start_date={ISO}&end_date={ISO}`
Cranes free for the date range (lifecycle available + no overlap).
→ `Equipment[]` | 400 (bad dates)

### PATCH `/cranes/{crane_id}/lifecycle`
Manual lifecycle change. Body (`LifecycleUpdate`):
```json
{ "lifecycle_status":"repair", "note":"hydraulic service" }
```
`lifecycle_status` ∈ available|booked|working|repair|deceased. Moving to
repair/deceased cancels outstanding bookings.

---

## Bookings

### GET `/bookings?status={s}&crane_id={id}`
List (optional filters). → `BookingWithCrane[]`

### GET `/bookings/{booking_id}`
One booking. → `BookingWithCrane` | 404

### POST `/bookings`
Create (status pending). Body (`BookingCreate`):
```json
{ "crane_id":"CR-001","customer_name":"Metro Corp",
  "customer_phone":"+91...","site_address":"Hinjewadi",
  "start_date":"2025-06-01T09:00:00Z","end_date":"2025-06-03T18:00:00Z" }
```
Validates crane availability + no overlap; `amount = hourly_rate × hours`.
→ `Booking` | 404 | 409 | 422

### POST `/bookings/{booking_id}/pay`
Mock payment (the non-Razorpay path). Body (`PaymentRequest`):
```json
{ "method":"card", "simulate_failure":false }
```
On success: paid + confirmed, crane → booked. → `PaymentResult`

### PATCH `/bookings/{booking_id}/status`
Drive the state machine. Body (`BookingStatusUpdate`):
```json
{ "booking_status":"active" }
```
Allowed: pending→confirmed|cancelled, confirmed→active|cancelled,
active→completed|cancelled. → `Booking` | 409 (invalid transition)

---

## Payments (Razorpay)

### GET `/payments/config`
→ `{ "key_id":"rzp_test_...", "mode":"live"|"demo" }`

### POST `/payments/create-order`
Create a Razorpay order for a booking. Body: `{ "booking_id": 1 }`
→ order details (id, amount in paise, currency)

### POST `/payments/verify`
Verify checkout result + confirm booking. Body:
```json
{ "booking_id":1, "razorpay_order_id":"order_...",
  "razorpay_payment_id":"pay_...", "razorpay_signature":"..." }
```
Verifies signature; on success confirms booking + flips crane lifecycle.
In demo mode, verification is simulated.

### POST `/payments/webhook`
Razorpay server-to-server events (e.g. payment captured).

---

## Dashboard & Reports

### GET `/dashboard/summary`
Aggregated KPIs. → `DashboardSummary`:
```json
{ "total_equipment":n, "total_cranes":n,
  "crane_status_breakdown":[{"lifecycle_status":"available","count":3}, ...],
  "available_cranes":n,"booked_cranes":n,"working_cranes":n,
  "repair_cranes":n,"deceased_cranes":n,
  "total_vendors":n,"active_bookings":n,"pending_payments":n,
  "revenue_collected":123.0 }
```

### GET `/reports/utilization/{equipment_id}?start={ISO}&end={ISO}`
Per-machine utilization over a range (working/idle/downtime, uptime %,
utilization %).

### GET `/reports/fleet-utilization?start={ISO}&end={ISO}`
Fleet-wide utilization aggregation.

---

## AI Chat

### GET `/chat/{vendor_id}`
Chat history for a vendor. → `ChatMessage[]`

### POST `/chat/{vendor_id}`
Send a message; get a reply (non-streaming). Body: `{ "message":"...", "channel":"in_app" }`
→ `{ user_message, assistant_message }`

### POST `/chat/{vendor_id}/stream`
Send a message; reply streams via **SSE** (tokens as `data:` frames). Same body.
Grounded in the vendor's fleet data. Falls back to keyword reply if LLM down.

### POST `/chat/{vendor_id}/quick-action`
Canned prompts. Body: `{ "action":"status"|"eta"|"maintenance"|"payment_reminder" }`

---

## AI Voice

### POST `/voice/call/{vendor_id}`
Place a **real** outbound AI call via the external voice service.
→ voice call record (status, external_call_id) | **503** if service unavailable
(no mock fallback).

### GET `/voice/calls`
Voice call log. → `VoiceCall[]`

---

## Common Response Objects (shapes)

**Equipment**
```json
{ "id":"CR-001","name":"...","equipment_type":"crane","latitude":18.5,
  "longitude":73.8,"speed":0,"engine_on":false,"status":"stopped",
  "lifecycle_status":"available","vendor_id":1,"hourly_rate":1500 }
```

**CraneSummary** = Equipment fields + `vendor` (object) + `active_booking_id` +
`active_booking_customer`.

**Booking / BookingWithCrane**
```json
{ "id":1,"crane_id":"CR-001","customer_name":"...","start_date":"...",
  "end_date":"...","payment_status":"pending","booking_status":"pending",
  "amount":72000.0,"payment_reference":null,"created_at":"...",
  "crane_name":"...","vendor_name":"..." }   // last two only on WithCrane
```

**Alert**
```json
{ "id":1,"equipment_id":"CR-001","alert_type":"overspeed",
  "severity":"critical","message":"...","timestamp":"...","acknowledged":false }
```

---

## HTTP Status Codes Used

| Code | Meaning here |
|------|--------------|
| 200 | Success |
| 400 | Bad query params (e.g. malformed dates) |
| 404 | Entity not found |
| 409 | Conflict (invalid transition, overlap, already paid) |
| 422 | Payload validation error (Pydantic) |
| 503 | External voice service unavailable |
