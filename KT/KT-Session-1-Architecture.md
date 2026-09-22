# KT Session 1 — Architecture, Technology Stack, System Components & Data Flow

**Project:** FleetTrack – IoT Equipment Tracking & Crane Booking
**Audience:** Engineers, architects, and stakeholders taking over the project
**Goal of this session:** Understand *what the system is*, *how it is put
together*, and *how data moves through it* — before touching any code.

---

## 1. What FleetTrack Is

FleetTrack is a fleet-management platform for heavy construction equipment
(cranes, tractors, excavators, dumpers). It began as a GPS/IoT tracking POC and
grew into a fuller product covering the equipment's whole commercial lifecycle:

1. **Track** — every machine carries a GPS/IoT device that reports position,
   speed, engine state and signal strength in near-real-time.
2. **Monitor** — a live dashboard and map show current status; a rule engine
   raises alerts (low signal, overspeed, disconnect); geofences define zones.
3. **Book** — cranes can be rented out. A booking flow checks availability,
   takes payment (Razorpay), and drives the crane through a lifecycle
   (available → booked → working → repair → deceased).
4. **Analyse** — utilization reports show working vs idle vs downtime, per
   machine and fleet-wide, with charts and PDF export.
5. **Communicate** — an AI chat agent and AI voice agent contact the vendor
   who owns each crane to get status updates.

---

## 2. Architecture Overview

FleetTrack is a classic **three-tier web application** (presentation → API →
data) with three **external/adjacent services** attached to the API tier
(LLM, payments, voice) and a **device/ingestion tier** feeding telemetry in.

```
                          ┌───────────────────────────────────────────┐
   DEVICE / INGESTION     │              PRESENTATION TIER              │
   ┌──────────────────┐   │   Next.js 16 Frontend (TypeScript, port 3000)│
   │  GPS Simulator   │   │   Dashboard | Map | Bookings | Reports |     │
   │ (or real IoT     │   │   Chat/Voice | Alerts | Equipment | Devices  │
   │  hardware later) │   └───────────────────┬─────────────────────────┘
   └────────┬─────────┘                       │ REST (JSON) + WebSocket + SSE
            │ HTTP POST /telemetry             │
            │ (every ~3s per device)           ▼
            │              ┌───────────────────────────────────────────┐
            └─────────────▶│              APPLICATION TIER               │
                           │      FastAPI Backend (Python, port 8000)    │
                           │  Routers: equipment, telemetry, devices,    │
                           │  alerts, geofences, vendors, cranes,        │
                           │  bookings, payments, reports, chat, voice   │
                           │  Services: utilization, alerts, bookings,   │
                           │  payment, communication, llm                │
                           └───┬───────────┬───────────┬────────────┬────┘
                               │           │           │            │
                    SQLAlchemy │      Groq/│    Razorpay│      Voice │
                       (psycopg2)  Ollama  │      REST  │   Service  │
                               ▼           ▼           ▼            ▼
                    ┌──────────────┐ ┌──────────┐ ┌─────────┐ ┌──────────────┐
   DATA TIER        │ PostgreSQL 16│ │  LLM      │ │Razorpay │ │ AI Voice     │
                    │ (Docker,     │ │ (Groq API │ │ (test   │ │ Service      │
                    │  port 5433)  │ │  or local │ │  mode)  │ │ (Twilio-     │
                    │ 9 tables     │ │  Ollama)  │ │         │ │  backed)     │
                    └──────────────┘ └──────────┘ └─────────┘ └──────────────┘
```

### Tiers explained

- **Device / Ingestion tier** — Today this is the Python **GPS simulator**
  (`backend/gps_simulator.py`) which mimics real trackers and POSTs telemetry to
  the backend every few seconds. In production this would be real hardware
  (e.g. ESP32 + SIM7600, Queclink, Teltonika) publishing over MQTT; a bridge
  service (`mqtt/bridge.py`) is already built to relay MQTT → the same
  `/telemetry` endpoint. (The MQTT path is dormant in the current demo.)

- **Presentation tier** — Next.js single-page-style app (App Router). Talks to
  the backend over three channels: normal **REST** (JSON) for CRUD, a
  **WebSocket** for real-time telemetry push to the live map, and **SSE**
  (Server-Sent Events) for streaming AI chat replies token-by-token.

- **Application tier** — FastAPI. All business logic lives here. Routes are in
  `main.py`; reusable logic sits in `services/`. Stateless — all state is in
  PostgreSQL.

- **Data tier** — PostgreSQL 16 running in Docker. Nine tables (details in
  Section 5 and the LLD).

- **External services** — three integrations hang off the application tier:
  - **LLM** (Groq cloud, or local Ollama fallback) for chat + voice transcripts
  - **Razorpay** for booking payments
  - **AI Voice Service** for real outbound phone calls to vendors

---

## 3. Technology Stack

### Backend
| Layer | Technology | Notes |
|-------|-----------|-------|
| Language | Python 3.11+ | |
| Web framework | FastAPI | async, auto OpenAPI docs at `/docs` |
| ASGI server | Uvicorn | `uvicorn app.main:app` |
| ORM | SQLAlchemy 2.0 | modern `Mapped[...]` typed models |
| DB driver | psycopg2 | PostgreSQL |
| Validation | Pydantic v2 | request/response schemas |
| HTTP client | requests | calls Groq, Ollama, voice service |
| Payments SDK | razorpay | order creation + signature verification |

### Frontend
| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 16.3.1 (App Router) | |
| Language | TypeScript | |
| UI runtime | React 19 | |
| Styling | Tailwind CSS v4 | |
| Maps | Leaflet + react-leaflet | tiles via MapTiler |
| Charts | Recharts | dashboard + reports |
| Icons | lucide-react | |
| PDF export | html2canvas + jspdf | utilization report export |

### Data & Infrastructure
| Component | Technology | Notes |
|-----------|-----------|-------|
| Database | PostgreSQL 16 | Docker container `fleet_postgres`, host port 5433 |
| Local LLM | Ollama + `qwen2.5:3b` | port 11434, fallback provider |
| Cloud LLM | Groq + `openai/gpt-oss-120b` | default when `GROQ_API_KEY` is set |
| Payments | Razorpay (test mode) | |
| Voice | External AI voice service | `http://3.92.238.46:8002/call/initiate` |
| Tunnel | ngrok | exposes local backend publicly for the hosted frontend |
| Frontend hosting | Vercel | https://fleet-track-black.vercel.app |
| Message broker (dormant) | Eclipse Mosquitto (MQTT) | built, ready for real hardware |

### Real-time channels
| Channel | Used for |
|---------|---------|
| REST (JSON) | All CRUD + queries |
| WebSocket (`/ws/telemetry`) | Push live equipment positions to the map |
| SSE (`/chat/{vendor_id}/stream`) | Stream AI chat reply tokens as generated |

---

## 4. System Components (Module Breakdown)

### 4.1 Backend application (`backend/venv/app/`)
| File | Responsibility |
|------|----------------|
| `main.py` | FastAPI app + **all HTTP/WebSocket routes**, CORS, startup hooks, WebSocket connection manager |
| `database.py` | SQLAlchemy engine + session factory; the PostgreSQL connection string |
| `dependencies.py` | `get_db()` FastAPI dependency (per-request DB session) |
| `db_models.py` | SQLAlchemy ORM models = the 9 database tables |
| `models.py` | Core Pydantic model (`Equipment`) + status `Literal` types |
| `schemas.py` | All request/response Pydantic schemas (vendors, bookings, payments, etc.) |
| `migrations.py` | Lightweight idempotent DDL patcher (adds columns to existing tables) |
| `seed.py` | Seeds demo data (vendors, cranes, devices, a sample booking) |
| `services/utilization.py` | Computes working/idle/downtime, uptime %, utilization % |
| `services/alerts.py` | Rule engine: low signal, overspeed, device reconnect/disconnect |
| `services/bookings.py` | Availability, overlap checks, booking creation, mock payment, lifecycle state machine |
| `services/payment.py` | Razorpay order creation, signature verification, webhook (live + demo modes) |
| `services/communication.py` | Chat + voice orchestration; builds prompts, calls LLM + voice service |
| `services/llm.py` | Provider-agnostic LLM client (Groq primary, Ollama fallback) |

### 4.2 Frontend application (`frontend/`)
| Path | Responsibility |
|------|----------------|
| `app/page.tsx` | Dashboard (KPIs, crane status chart, vendor cards, live map) |
| `app/tracking/` | Full-page live tracking map |
| `app/equipment/`, `app/equipment/[id]/` | Equipment list + detail |
| `app/devices/` | GPS device connectivity table |
| `app/telemetry/` | Telemetry history viewer |
| `app/alerts/` | Alert feed + acknowledge |
| `app/analytics/` | Fleet analytics charts |
| `app/bookings/`, `bookings/new/`, `bookings/history/` | Booking list, wizard, history |
| `app/reports/` | Utilization reports + PDF export |
| `app/chat/` | AI chat + voice-call panel |
| `lib/api.ts` | Typed API client (`fetchApi` wrapper) |
| `lib/types.ts` | TypeScript types mirroring backend schemas |
| `lib/hooks/` | Data hooks: `useEquipment`, `useDevices`, `useBookings`, `useCranes`, `useDashboard`, `useAlerts`, `useWebSocket` |
| `components/` | UI components grouped by domain (layout, dashboard, map, bookings, analytics, equipment, ui) |

### 4.3 Ingestion & infra
| Path | Responsibility |
|------|----------------|
| `backend/gps_simulator.py` | Simulates GPS devices, POSTs telemetry (primary ingestion in demo) |
| `mqtt/docker-compose.yml` | Mosquitto MQTT broker (dormant) |
| `mqtt/bridge.py` | MQTT → HTTP bridge; subscribes `fleet/telemetry/#`, forwards to `/telemetry` |
| `start-all.ps1` | One-command startup for the whole stack |
| `secrets.local.ps1` | Local secrets (git-ignored): API keys |

---

## 5. Data Model (Conceptual)

Nine tables. Relationships:

```
vendors (1) ───< (N) equipment          a vendor owns many machines
equipment (1) ─< (N) devices            a machine has GPS device(s)
equipment (1) ─< (N) telemetry          a machine has many telemetry rows
equipment (1) ─< (N) bookings           a crane has many bookings (crane_id)
vendors  (1) ──< (N) chat_messages      chat thread per vendor
vendors  (1) ──< (N) voice_calls        call log per vendor
equipment ····  alerts                  alerts reference equipment_id (no hard FK)
geofences                                standalone zones (polygon JSON)
```

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `equipment` | The machines | `id` (PK, string e.g. `CR-001`), `equipment_type`, live `status`, business `lifecycle_status`, `vendor_id`, `hourly_rate` |
| `vendors` | Equipment owners | `id`, `name`, `phone`, `email`, `company` |
| `devices` | GPS trackers | `device_id` (PK), `equipment_id`, `connected`, `signal_strength` |
| `telemetry` | Time-series GPS history | `equipment_id`, `latitude`, `longitude`, `speed`, `engine_on`, `timestamp`, `status` |
| `bookings` | Crane rentals | `crane_id`, `customer_name`, dates, `payment_status`, `booking_status`, `amount` |
| `alerts` | Rule-engine output | `equipment_id`, `alert_type`, `severity`, `message`, `acknowledged` |
| `geofences` | Boundary zones | `name`, `polygon` (JSON string of lat/lng points) |
| `chat_messages` | Vendor chat threads | `vendor_id`, `sender`, `message`, `channel` |
| `voice_calls` | AI call logs | `vendor_id`, `call_status`, `transcript`, `summary`, `external_call_id` |

### Two independent status axes on `equipment` (important concept)
- **`status`** — *operational*, derived from live telemetry: `working` / `idle` / `stopped`.
- **`lifecycle_status`** — *commercial*, driven by bookings/manual action:
  `available` → `booked` → `working` → `repair` → `deceased`.

These are deliberately separate: a crane can be commercially `booked` while its
telemetry says `stopped` (engine off overnight).

---

## 6. Key Data Flows

### 6.1 Telemetry ingestion (the core IoT flow)
```
GPS Simulator / device
   │  POST /telemetry  { equipment_id, device_id, lat, lng, speed, engine_on, ts, signal }
   ▼
FastAPI /telemetry handler
   │  1. Look up device + equipment
   │  2. Derive operational status:
   │        engine_off               -> "stopped"
   │        engine_on & speed < 1    -> "idle"
   │        engine_on & speed >= 1   -> "working"
   │  3. Update equipment (current position + status)
   │  4. Insert a telemetry history row
   │  5. Update device connectivity (connected, last_seen, signal)
   │  6. Run alert rules (services/alerts.py)
   │  7. Broadcast the update over the WebSocket
   ▼
PostgreSQL  +  WebSocket clients (live map updates instantly)
```

### 6.2 Booking + payment flow
```
User picks dates -> GET /cranes/available  (availability + overlap check)
User selects crane, enters details -> POST /bookings  (status: pending)
Pay -> POST /payments/create-order  -> Razorpay order created
Razorpay Checkout (frontend popup) -> user pays
Verify -> POST /payments/verify  (signature check)
   -> booking: payment_status=paid, booking_status=confirmed
   -> crane lifecycle_status: available -> booked
Later: PATCH /bookings/{id}/status  drives active -> completed, etc.,
       with matching crane lifecycle transitions.
```

### 6.3 Utilization reporting
```
GET /reports/utilization/{equipment_id}?start&end
   -> pull telemetry rows in range
   -> services/utilization.py sums time in each status between consecutive points
   -> returns working/idle/downtime seconds, uptime %, utilization %
Frontend renders Recharts graphs; html2canvas+jspdf export to PDF.
```

### 6.4 AI chat flow (with streaming)
```
User message -> POST /chat/{vendor_id}/stream (SSE)
   -> communication.py builds a context-rich prompt
      (vendor's cranes, statuses, rates, active bookings)
   -> llm.py streams tokens from Groq (or Ollama fallback)
   -> tokens pushed to the browser as they generate (SSE)
   -> full reply + user message persisted in chat_messages
```

### 6.5 AI voice flow
```
User clicks "Call Vendor" -> POST /voice/call/{vendor_id}
   -> communication.py builds call context (vendor, crane, booking)
   -> POSTs to external voice service /call/initiate
   -> service dials the vendor's real phone, runs the AI conversation
   -> a voice_calls row is logged (status, external_call_id)
   -> transcript/summary captured on completion
   If the service is unreachable: HTTP 503, UI shows "voice channel busy"
   (no fake fallback).
```

---

## 7. Design Principles Worth Knowing

- **Stateless backend.** All state is in PostgreSQL; the API can be restarted
  freely. The only in-memory state is the set of active WebSocket connections.
- **Graceful degradation.** If the LLM is down, chat falls back to keyword
  replies. If Razorpay keys are absent, payments run in demo mode. If the voice
  service is down, the UI reports "busy" rather than crashing.
- **Separation of operational vs commercial status** (see Section 5).
- **Hardware-ready ingestion.** The `/telemetry` contract is identical whether
  data comes from the simulator or a future MQTT bridge, so swapping in real
  devices requires no API change.
- **Idempotent schema patching.** `migrations.py` adds new columns on startup
  without a migration framework (POC-level; Alembic recommended for production).

---

## 8. Session 1 Recap / Talking Points

- Three-tier app + device ingestion + three external services.
- Backend = FastAPI/PostgreSQL; Frontend = Next.js; Ingestion = GPS simulator
  (MQTT-ready).
- 9 tables; the two-status-axis design on `equipment` is the key modelling idea.
- Real-time via WebSocket (map) and SSE (chat).
- Everything degrades gracefully when an external dependency is unavailable.

> **Next session (KT-2):** we get hands-on — set up the backend and database,
> walk the APIs, run telemetry ingestion and the GPS simulator, and tour the
> frontend, with exact execution steps.
