# Handover — Low-Level Design / Technical Design (LLD/TDD)

**Project:** FleetTrack – IoT Equipment Tracking & Crane Booking
**Scope:** Database schema, module-level design, algorithms, and key functions.

---

## 1. Database Schema (PostgreSQL)

Nine tables. ORM definitions in `backend/venv/app/db_models.py` (SQLAlchemy 2.0
typed `Mapped[...]` style). Tables auto-created on startup via
`Base.metadata.create_all()` plus idempotent patching in `migrations.py`.

### 1.1 `equipment`
| Column | Type | Notes |
|--------|------|-------|
| id | VARCHAR(50) PK | e.g. `CR-001` (business ID, not autoincrement) |
| name | VARCHAR(100) | |
| equipment_type | VARCHAR(50) | tractor / crane / excavator / dumper |
| latitude | FLOAT | current position |
| longitude | FLOAT | current position |
| speed | FLOAT | current km/h, default 0 |
| engine_on | BOOLEAN | default false |
| status | VARCHAR(20) | operational: working / idle / stopped |
| lifecycle_status | VARCHAR(20) | commercial: available / booked / working / repair / deceased; default `available` |
| vendor_id | INTEGER FK→vendors.id | nullable |
| hourly_rate | FLOAT | rental pricing, default 0 |

### 1.2 `vendors`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK autoincrement | |
| name | VARCHAR(100) | |
| phone | VARCHAR(30) | used for voice calls |
| email | VARCHAR(150) | |
| company | VARCHAR(150) | |
| created_at | DATETIME | |

### 1.3 `devices`
| Column | Type | Notes |
|--------|------|-------|
| device_id | VARCHAR(50) PK | e.g. `GPS-CR-001` |
| equipment_id | VARCHAR(50) FK→equipment.id | |
| connected | BOOLEAN | default false |
| last_seen | DATETIME | nullable |
| signal_strength | INTEGER | 0–100, default 0 |

### 1.4 `telemetry` (append-only time series)
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK autoincrement | |
| equipment_id | VARCHAR FK→equipment.id | |
| device_id | VARCHAR(50) | |
| latitude / longitude | FLOAT | |
| speed | FLOAT | |
| engine_on | BOOLEAN | |
| timestamp | DATETIME | reading time |
| signal_strength | INTEGER | |
| status | VARCHAR(20) | derived at ingest |

### 1.5 `bookings`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK autoincrement | |
| crane_id | VARCHAR FK→equipment.id, indexed | |
| customer_name | VARCHAR(150) | |
| customer_phone | VARCHAR(30) | nullable |
| site_address | VARCHAR(300) | nullable |
| start_date / end_date | DATETIME | |
| payment_status | VARCHAR(20) | pending / paid / failed / refunded |
| booking_status | VARCHAR(20) | pending / confirmed / active / completed / cancelled |
| amount | FLOAT | computed = hourly_rate × hours |
| payment_reference | VARCHAR(60) | nullable; `PAY-...` (mock) or Razorpay id |
| created_at | DATETIME | |

### 1.6 `alerts`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK autoincrement | |
| equipment_id | VARCHAR(50) | soft reference (no hard FK) |
| alert_type | VARCHAR(50) | low_signal / overspeed / device_reconnected / device_disconnected |
| severity | VARCHAR(20) | info / warning / critical |
| message | VARCHAR(500) | |
| timestamp | DATETIME | |
| acknowledged | BOOLEAN | default false |

### 1.7 `geofences`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK autoincrement | |
| name | VARCHAR(100) | |
| polygon | VARCHAR(5000) | JSON string: `[[lat,lng], ...]` |
| created_at | DATETIME | |

### 1.8 `chat_messages`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK autoincrement | |
| vendor_id | INTEGER FK→vendors.id, indexed | |
| sender | VARCHAR(20) | user / vendor |
| message | VARCHAR(2000) | |
| status | VARCHAR(20) | sent / delivered / read |
| channel | VARCHAR(20) | whatsapp / sms / in_app |
| timestamp | DATETIME | |

### 1.9 `voice_calls`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK autoincrement | |
| vendor_id | INTEGER FK→vendors.id, indexed | |
| direction | VARCHAR(20) | outbound / inbound |
| call_status | VARCHAR(20) | initiated / ringing / in_progress / completed / failed |
| duration_seconds | INTEGER | default 0 |
| transcript | VARCHAR(5000) | nullable |
| summary | VARCHAR(1000) | nullable |
| external_call_id | VARCHAR(100) | provider SID (Twilio/Bland.ai) |
| initiated_at | DATETIME | |
| completed_at | DATETIME | nullable |

### 1.10 Entity-Relationship Summary
```
vendors 1──N equipment 1──N devices
                    │      1──N telemetry
                    │      1──N bookings (crane_id)
vendors 1──N chat_messages
vendors 1──N voice_calls
alerts  N──1 equipment (soft ref by equipment_id)
geofences (standalone)
```

---

## 2. Module Design — Backend

### 2.1 `main.py` (route layer)
- Creates the FastAPI `app`, configures CORS (`allow_origins=["*"]`).
- Defines a `ConnectionManager` for WebSocket clients (connect / disconnect /
  broadcast).
- On startup: `Base.metadata.create_all()`, then `ensure_schema()`, then LLM
  `warmup()`.
- Hosts every route (see API Reference). Routes are thin: validate input,
  call a service or query the ORM, return a Pydantic schema.

### 2.2 `database.py`
- `engine = create_engine(DATABASE_URL, echo=True)` — note `echo=True` logs SQL
  (verbose; disable for production).
- `SessionLocal` session factory; `Base` declarative base.

### 2.3 `dependencies.py`
- `get_db()` generator dependency: yields a session, closes it in `finally`.

### 2.4 `db_models.py` / `models.py` / `schemas.py`
- `db_models.py` — the 9 ORM tables.
- `models.py` — `Equipment` Pydantic model + `EquipmentStatus` and
  `LifecycleStatus` Literals (single source of truth for status values).
- `schemas.py` — request/response DTOs: `Telemetry`, `EquipmentCreate`,
  `DeviceCreate`, vendor schemas, `CraneSummary`, `BookingCreate`, `Booking`,
  `PaymentRequest/Result`, `DashboardSummary`, etc. `BookingCreate` has a
  validator enforcing `end_date > start_date`.

### 2.5 `migrations.py`
- `ensure_schema(engine)` runs `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for
  `lifecycle_status`, `vendor_id`, `hourly_rate`; adds the vendor FK if absent;
  backfills null `lifecycle_status` to `available`. Idempotent.

---

## 3. Service Layer — Algorithms & Functions

### 3.1 `services/utilization.py` — `calculate_utilization(records)`
- Input: telemetry rows for an equipment (optionally date-bounded).
- Sorts by timestamp. For each consecutive pair, adds the interval to the
  bucket matching the earlier record's `status` (working / idle / offline).
- Computes:
  - `uptime_seconds = working + idle`
  - `uptime_percentage = uptime / total × 100`
  - `utilization_percentage = working / uptime × 100`
- Returns all buckets + percentages (rounded).
- Edge case: fewer than 2 records → all zeros.

### 3.2 `services/alerts.py` — `check_alerts(...)`
Rules evaluated on each telemetry ingest:
| Rule | Condition | Type / Severity |
|------|-----------|-----------------|
| Low signal | `signal_strength < 50` | low_signal / warning |
| Overspeed | `speed > 15` | overspeed / critical |
| Reconnect | device was disconnected, now reporting | device_reconnected / info |
Also `check_device_disconnect(...)` for stale devices (intended for a
background job). Creates `AlertDB` rows.

### 3.3 `services/bookings.py`
Core rental logic and the crane lifecycle state machine.
- `get_available_cranes(db, start, end)` — cranes with `lifecycle_status
  == available` and no overlapping confirmed/active booking.
- `check_overlap(...)` — detects date-range conflicts.
- `create_booking(...)` — validates crane exists, is a crane, is available, no
  overlap; computes `amount = hourly_rate × hours` (min 1 hour); persists a
  `pending` booking. All datetimes normalized to tz-naive.
- `process_payment(db, booking_id, simulate_failure)` — the **mock** gateway.
  On success sets `paid`+`confirmed`, generates `PAY-<uuid>`, flips crane
  `available → booked`. (The Razorpay path lives in `payment.py`.)
- `update_booking_status(...)` — enforces the state machine and applies
  side-effects on the crane:
  ```
  pending   -> confirmed | cancelled
  confirmed -> active    | cancelled
  active    -> completed | cancelled
  completed -> (terminal)
  cancelled -> (terminal)
  ```
  On `confirmed`: crane available→booked. On `active`: booked→working. On
  `completed`/`cancelled`: crane returns to `available` if no other
  confirmed/active bookings remain.
- `update_crane_lifecycle(...)` — manual override; moving to `repair`/`deceased`
  cancels outstanding bookings.

### 3.4 `services/payment.py` — Razorpay
- `get_config()` — returns publishable key + `live`/`demo` mode.
- `create_order(booking_id)` — creates a Razorpay order (amount in paise).
- `verify_payment(...)` — verifies Razorpay signature; on success confirms the
  booking and flips crane lifecycle.
- `handle_webhook(...)` — processes Razorpay server events.
- **Demo mode** (no keys): simulates order/verification so the flow works
  end-to-end without credentials.

### 3.5 `services/communication.py` — Chat & Voice
- **Chat:** builds a fleet-grounded prompt (the vendor's cranes, their statuses,
  rates, and active bookings), calls `llm.chat`/`llm.chat_stream`, persists both
  the user message and the reply. Streaming variant yields tokens for SSE.
  Falls back to keyword replies if the LLM returns nothing.
- **Voice:** `initiate_voice_call(vendor_id)` assembles call context and POSTs
  to the external voice service (`VOICE_CALL_SERVICE_URL`, default
  `http://3.92.238.46:8002/call/initiate`). Logs a `voice_calls` row. **No mock
  fallback** — a failure raises HTTP 503 ("voice channel busy").

### 3.6 `services/llm.py` — Provider Abstraction
- Provider chosen at import: **Groq** if `GROQ_API_KEY` set, else **Ollama**.
- Public API: `chat`, `chat_stream`, `warmup`, `model_info`, `is_available` —
  provider-agnostic so callers don't branch.
- Groq path: OpenAI-compatible `/chat/completions` (streaming via SSE frames).
- Ollama path: local `/api/chat` with `keep_alive` to avoid cold starts.
- Defaults: `GROQ_MODEL=openai/gpt-oss-120b`, `OLLAMA_MODEL=qwen2.5:3b`.
- All failures return `None`/empty so callers fall back safely.

---

## 4. Telemetry Ingestion Algorithm (`POST /telemetry`)

```
INPUT: Telemetry { equipment_id, device_id, lat, lng, speed, engine_on, ts, signal }

1. device = lookup(device_id)            ; 404 if missing
2. equipment = lookup(equipment_id)      ; 404 if missing
3. status = derive_status(engine_on, speed):
        engine_on == false  -> "stopped"
        speed < 1           -> "idle"
        else                -> "working"
4. equipment.{lat,lng,speed,engine_on,status} = incoming values
5. INSERT telemetry row (with derived status)
6. device.{connected=true, last_seen=ts, signal_strength}
7. check_alerts(...)                     ; may INSERT alert rows
8. commit
9. ws_manager.broadcast(update)          ; push to live map clients
```

---

## 5. Frontend Design (Key Points)

- **Data hooks** (`lib/hooks/`) encapsulate fetching + polling; components stay
  presentational.
- **`useWebSocket`** subscribes to `/ws/telemetry` and merges live updates into
  equipment state for the map.
- **`lib/api.ts`** centralizes all HTTP; injects `Content-Type` and
  `ngrok-skip-browser-warning` headers.
- **Booking wizard** (`app/bookings/new`) orchestrates:
  availability → selection → details → Razorpay Checkout (via
  `NEXT_PUBLIC_RAZORPAY_KEY_ID`) → `/payments/verify`.
- **Reports** (`app/reports`) render Recharts graphs and export via
  html2canvas → jspdf.
- **Chat** (`app/chat`) consumes the SSE stream, appending tokens as they
  arrive; the voice panel calls `/voice/call/{vendor_id}` and renders status.

---

## 6. Error Handling Conventions

| Situation | Behaviour |
|-----------|-----------|
| Unknown entity | HTTP 404 with detail |
| Invalid state transition / overlap / already paid | HTTP 409 |
| Bad payload (schema/date validation) | HTTP 422 |
| External voice service down | HTTP 503 "voice channel busy" |
| LLM unavailable | Silent fallback (keyword reply), never 5xx |
| Payment keys absent | Demo mode, not an error |

---

## 7. Configuration Surface (env vars)

| Var | Default | Used by |
|-----|---------|---------|
| `GROQ_API_KEY` | (unset) | llm.py — selects Groq |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | llm.py |
| `OLLAMA_HOST` | `http://localhost:11434` | llm.py |
| `OLLAMA_MODEL` | `qwen2.5:3b` | llm.py |
| `OLLAMA_KEEP_ALIVE` | `30m` | llm.py |
| `RAZORPAY_KEY_ID` / `_SECRET` | (unset → demo) | payment.py |
| `VOICE_CALL_SERVICE_URL` | `http://3.92.238.46:8002/call/initiate` | communication.py |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | frontend |
| `NEXT_PUBLIC_MAPTILER_KEY` | — | frontend map |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | — | frontend checkout |

DB connection string is currently hardcoded in `database.py` (move to env for
production).

---

## 8. Testing Design

- `backend/tests/test_api.py` — 50 integration tests using `httpx`/`pytest`
  against a running instance. Covers equipment, devices, telemetry, alerts,
  geofences, vendors, cranes, bookings, payments (demo), reports, chat, voice,
  dashboard, and health endpoints.
- Run: `pytest tests/test_api.py -v` (backend + DB must be up).

---

## 9. Recommended Refactors (for productionization)

1. Move app package out of `backend/venv/app` to `backend/app`.
2. Replace `migrations.py` with **Alembic**.
3. Externalize the DB connection string; disable `echo=True`.
4. Restrict CORS to known origins.
5. Add authentication/authorization.
6. Wire the MQTT bridge for real devices; add a device-disconnect background job.
7. Add a webhook to receive final voice transcripts and update `voice_calls`.
