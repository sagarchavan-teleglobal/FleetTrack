# FleetTrack — Application Flow & Architecture

## Overview

FleetTrack is a full-stack fleet management and crane booking system with real-time GPS tracking, AI-powered vendor communication, utilization analytics, and integrated payments.

**Tech Stack:**
- Backend: FastAPI (Python) + PostgreSQL + SQLAlchemy
- Frontend: Next.js 16 + TypeScript + Tailwind CSS + Recharts
- Real-time: WebSocket (telemetry push) + Server-Sent Events (chat streaming)
- AI: Ollama + Qwen 2.5 3B (local LLM, no API keys)
- IoT: MQTT broker (Mosquitto) + GPS simulator
- Payments: Razorpay (live test mode)
- Maps: MapTiler + Leaflet
- Infrastructure: Docker (PostgreSQL), Ollama (LLM)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                         │
│  Dashboard │ Bookings │ Reports │ Chat/Voice │ Map │ Equipment   │
└──────┬──────────┬──────────┬──────────┬──────────┬──────────────┘
       │          │          │          │          │
       │   REST   │   REST   │   SSE    │   WS     │
       ▼          ▼          ▼          ▼          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (FastAPI)                             │
│  Equipment │ Bookings │ Payments │ Chat │ Voice │ Reports │ GPS  │
└──────┬──────────┬──────────┬──────────┬──────────┬──────────────┘
       │          │          │          │          │
       ▼          ▼          ▼          ▼          ▼
  PostgreSQL   Razorpay    Ollama    MQTT Broker   GPS Simulator
  (port 5433)   (API)    (port 11434)  (Docker)    (Python)
```

---

## Module 1: Real-Time Fleet Tracking

### Equipment & Devices
- Equipment types: tractor, crane, excavator, dumper
- Each equipment has a GPS device (e.g., GPS-CR-001 → CR-001)
- Device tracks: connected status, last_seen, signal_strength

### GPS Telemetry Pipeline
```
GPS Simulator → POST /telemetry → Update Equipment Position
                                 → Store Telemetry History
                                 → Check Alert Rules
                                 → Broadcast via WebSocket
```

### Telemetry Status Logic
- `speed > 1 km/h + engine_on` → **working**
- `speed < 1 + engine_on` → **idle**
- `engine_off` → **stopped**

### Live Map
- MapTiler tiles with Leaflet markers
- Equipment markers update in real-time via WebSocket
- Color-coded by status (green/amber/red)
- History trail visualization per equipment

### Alert Engine
- Low GPS signal (< 40%)
- Overspeed detection
- Device disconnection timeout
- Severity levels: info, warning, critical
- Acknowledge workflow (single + bulk)

### Geofencing
- Create polygon boundary zones on the map
- CRUD management via API
- Visual overlay on the live map

---

## Module 2: Crane Booking System

### Crane Lifecycle (independent of telemetry status)
```
available → booked → working → repair → deceased
```

Transitions:
- `available → booked`: On payment confirmation
- `booked → working`: On "Start Work" action
- `working/booked → available`: On booking completion (if no other active bookings)
- `any → repair/deceased`: Manual override (cancels active bookings)

### Booking State Machine
```
pending → confirmed → active → completed
  │          │          │
  └──────────┴──────────┴──→ cancelled
```

Valid transitions enforced by backend. Invalid transitions return 409.

### Booking Flow
1. Select date range → check crane availability (overlap validation)
2. Choose available crane (shows name, rate, vendor)
3. Enter customer details (name, phone, site address)
4. Create booking (status: pending, calculates amount from hourly_rate × hours)
5. Pay via Razorpay → booking confirmed, crane lifecycle → booked
6. Start Work → crane lifecycle → working
7. Complete → crane lifecycle → available (if no other bookings)

### Vendors
- Each crane is owned by one vendor
- Vendor fields: name, phone, email, company
- Dashboard shows vendor cards with contact info
- Vendor detail endpoint includes their cranes list

---

## Module 3: Payments (Razorpay)

### Flow
```
Frontend                    Backend                     Razorpay
   │                          │                           │
   │── POST /payments/        │                           │
   │   create-order ─────────►│── Create Order ──────────►│
   │                          │◄── order_id ──────────────│
   │◄── order details ────────│                           │
   │                          │                           │
   │── Open Checkout Popup ──►│                           │
   │   (Razorpay JS SDK)      │                           │
   │◄── payment_id + sig ─────│                           │
   │                          │                           │
   │── POST /payments/verify ►│── Verify Signature ──────►│
   │                          │   Mark booking paid        │
   │◄── confirmation ─────────│                           │
```

### Endpoints
- `GET /payments/config` — returns key_id, live_mode, currency
- `POST /payments/create-order` — creates Razorpay order
- `POST /payments/verify` — verifies signature, marks booking paid
- `POST /payments/webhook` — handles Razorpay server events

### Configuration
- `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` env vars
- When not set: runs in demo mode (simulates locally)
- Test card: 4111 1111 1111 1111, any expiry, any CVV, OTP: 1234

---

## Module 4: Utilization Reports

### Per-Crane Report (`GET /reports/utilization/{id}`)
- Date range filter
- Overall stats: working_seconds, idle_seconds, offline_seconds, uptime %, utilization %
- Daily breakdown for charting

### Fleet Report (`GET /reports/fleet-utilization`)
- All cranes compared side-by-side
- Same metrics per crane

### Frontend
- Bar chart: daily working vs idle hours
- Line chart: utilization % trend over time
- Fleet comparison bar chart + data table
- PDF export via html2canvas + jsPDF

---

## Module 5: AI Chat Agent

### Architecture
```
User Message → Store in DB → Build Fleet Context → LLM (Ollama)
                                                      │
                                                      ▼
                                              Stream tokens via SSE
                                                      │
                                                      ▼
                                              Store vendor reply in DB
```

### LLM Configuration
- Provider: Ollama (local, no API keys)
- Model: Qwen 2.5 3B (Q4_K_M quantized)
- Temperature: 0.8
- Max tokens: 150
- Keep alive: 30 minutes (avoids cold starts)
- Warmup on app startup

### Context Injection
The model receives real fleet data per vendor:
- Crane names, IDs, lifecycle status, live telemetry status
- Hourly rates
- Active bookings with customer names, site addresses, end dates

### Streaming
- `POST /chat/{vendor_id}/stream` — SSE endpoint
- Events: `user_message` → `token` (repeated) → `done`
- Frontend renders tokens live with blinking cursor

### Conversation Memory
- Last 10 messages passed as conversation history
- Enables multi-turn context (follow-up questions work)

### Fallback
- If Ollama is unavailable: keyword-based replies activate automatically
- App never breaks regardless of model state
- `GET /ai/status` reports availability

### Quick Actions
- Ask for Status
- Ask ETA
- Schedule Maintenance
- Payment Reminder

---

## Module 6: AI Voice Agent

### Call Flow
```
1. Opening     — Identify as FleetTrack, confirm vendor, name crane
2. Status      — Is the crane operational?
3. Progress    — What task is being done?
4. Issues      — Any maintenance needs?
5. Timeline    — On track for booking end date?
6. Closing     — Thank vendor, log update
```

### Transcript Generation
- LLM generates realistic 8-12 line call transcript
- Second LLM call produces structured summary:
  - Crane: [name and ID]
  - Status: [Operational / Under Repair / Idle]
  - Update: [description]
  - Issues: [any problems]
  - Action Items: [follow-ups]

### Architecture (Twilio/Bland.ai Ready)
- `external_call_id` field stores provider call SID
- Call log database with transcript + summary + duration
- Webhook endpoint ready for real telephony completion events

---

## Module 7: GPS Simulator

### `gps_simulator.py`
- Simulates 6 GPS devices with realistic movement
- Configurable interval (default: 3 seconds)
- Equipment profiles:
  - Cranes: slow (max 8 km/h), often idle
  - Tractors: faster (max 25 km/h), more active
- Behaviors: moving → idle → stopped cycles
- Geofenced within 5km radius of Pune center
- Signal strength fluctuation

---

## API Endpoints Summary

### Equipment & Devices
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /equipment | List all equipment |
| GET | /equipment/{id} | Get by ID |
| POST | /equipment | Create |
| DELETE | /equipment/{id} | Delete |
| GET | /devices | List GPS devices |
| POST | /devices | Register device |
| POST | /telemetry | Ingest GPS data |
| GET | /equipment/{id}/telemetry | History |
| GET | /equipment/{id}/telemetry/export | CSV export |
| GET | /equipment/{id}/utilization | Usage stats |

### Cranes & Lifecycle
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /cranes | All cranes with vendor + booking info |
| GET | /cranes/available | Available for date range |
| PATCH | /cranes/{id}/lifecycle | Manual status override |

### Bookings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /bookings | List (filterable by status/crane) |
| GET | /bookings/{id} | Detail |
| POST | /bookings | Create |
| PATCH | /bookings/{id}/status | Transition status |

### Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /payments/config | Gateway config for frontend |
| POST | /payments/create-order | Create Razorpay order |
| POST | /payments/verify | Verify payment signature |
| POST | /payments/webhook | Razorpay server events |

### Vendors
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /vendors | List all |
| GET | /vendors/{id} | Detail with cranes |
| POST | /vendors | Create |
| PATCH | /vendors/{id} | Update |
| DELETE | /vendors/{id} | Delete |

### Chat & Voice
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /chat/{vendor_id} | Conversation history |
| POST | /chat/{vendor_id} | Send message (non-streaming) |
| POST | /chat/{vendor_id}/stream | Send message (SSE streaming) |
| POST | /chat/{vendor_id}/quick-action | Pre-built templates |
| POST | /voice/call/{vendor_id} | Initiate AI voice call |
| GET | /voice/calls | Call history |

### Dashboard & Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /dashboard/summary | Aggregated KPIs |
| GET | /reports/utilization/{id} | Per-crane report |
| GET | /reports/fleet-utilization | Fleet comparison |

### Alerts & Geofences
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /alerts | List alerts |
| GET | /alerts/count | Unacknowledged count |
| PATCH | /alerts/{id}/acknowledge | Acknowledge one |
| PATCH | /alerts/acknowledge-all | Acknowledge all |
| GET | /geofences | List zones |
| POST | /geofences | Create zone |
| DELETE | /geofences/{id} | Delete zone |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | / | Health check |
| GET | /db-test | Database connection test |
| GET | /ai/status | LLM availability |
| WS | /ws/telemetry | Real-time telemetry stream |

---

## Running the Application

### Prerequisites
- Python 3.11+
- Node.js 18+
- Docker (for PostgreSQL)
- Ollama (for AI chat)

### Start Services
```bash
# 1. PostgreSQL
docker start fleet_postgres

# 2. Backend
cd backend/venv
export RAZORPAY_KEY_ID=rzp_test_xxxxx
export RAZORPAY_KEY_SECRET=xxxxxx
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 3. Frontend
cd frontend
npm run dev

# 4. GPS Simulator
cd backend
python gps_simulator.py --interval 3

# 5. Ollama (if not already running)
ollama serve
```

### Seed Data
```bash
cd backend
python seed.py
```

Creates: 3 vendors, 5 cranes, 1 tractor, 6 GPS devices, 1 sample booking.

### Test Suite
```bash
cd backend
python -m pytest tests/test_api.py -v
```
50 integration tests covering all endpoints.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| RAZORPAY_KEY_ID | (empty) | Razorpay test/live key |
| RAZORPAY_KEY_SECRET | (empty) | Razorpay secret |
| OLLAMA_HOST | http://localhost:11434 | Ollama server URL |
| OLLAMA_MODEL | qwen2.5:3b | Chat model name |
| OLLAMA_KEEP_ALIVE | 30m | How long model stays loaded |

---

## Repository

https://github.com/sagarchavan-teleglobal/FleetTrack.git
