# KT Session 2 — Backend Setup, Database, APIs, Telemetry, GPS Simulator & Frontend Walkthrough

**Project:** FleetTrack – IoT Equipment Tracking & Crane Booking
**Goal of this session:** Get hands-on. Set up and run the backend and
database, understand every API group, trace telemetry ingestion end-to-end,
run the GPS simulator, and tour the frontend — with exact commands.

> Assumes you've read **KT Session 1** (architecture) first.

---

## 1. Prerequisites

Install these before anything else:

| Tool | Version | Why |
|------|---------|-----|
| Python | 3.11+ | Backend |
| Node.js | 18+ | Frontend |
| Docker Desktop | latest | PostgreSQL container |
| Ollama | latest | Local LLM fallback (optional if using Groq) |
| ngrok | latest | Public tunnel (only for the hosted demo) |
| Git | latest | Source control |

Check:
```powershell
python --version
node --version
docker --version
ollama --version
```

---

## 2. Database Setup (PostgreSQL in Docker)

The backend expects PostgreSQL at `localhost:5433`, database `fleet_tracking`,
user `fleet_user`, password `fleet_password` (see `backend/venv/app/database.py`).

### First-time creation
```powershell
docker run -d `
  --name fleet_postgres `
  -e POSTGRES_DB=fleet_tracking `
  -e POSTGRES_USER=fleet_user `
  -e POSTGRES_PASSWORD=fleet_password `
  -p 5433:5432 `
  postgres:16
```
> Host port is **5433** (mapped to container 5432) to avoid clashing with any
> local Postgres on 5432.

### Subsequent runs
```powershell
docker start fleet_postgres
```

### Verify
```powershell
docker ps --filter "name=fleet_postgres"
# then, once the backend is up:
curl http://localhost:8000/db-test
# -> {"database":"fleet_tracking","status":"connected"}
```

### How tables are created
There is **no migration tool** in the POC. On startup the backend:
1. `Base.metadata.create_all(engine)` — creates any missing tables from the
   SQLAlchemy models in `db_models.py`.
2. `ensure_schema(engine)` (in `migrations.py`) — runs idempotent
   `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for the booking-era columns
   (`lifecycle_status`, `vendor_id`, `hourly_rate`) plus a vendor FK. Safe to
   run on every boot.

> For production, replace this with **Alembic** migrations.

---

## 3. Backend Setup (FastAPI)

> **Important folder note:** the application code lives at
> `backend/venv/app/`. Despite the `venv` name, this is real, tracked source —
> not a throwaway virtual environment. The Python virtual environment's
> interpreter is at `backend/venv/Scripts/python.exe`.

### 3.1 Install dependencies
The venv already contains the packages. If recreating from scratch:
```powershell
cd backend\venv
.\Scripts\python.exe -m pip install fastapi uvicorn sqlalchemy psycopg2-binary pydantic requests razorpay groq
```

### 3.2 Configure secrets (optional but recommended)
Secrets are supplied as environment variables. The startup script loads them
from `secrets.local.ps1` (git-ignored). Copy the template:
```powershell
Copy-Item secrets.example.ps1 secrets.local.ps1
# then edit secrets.local.ps1 and fill in:
#   $env:GROQ_API_KEY        = "gsk_..."        (fast cloud chat; omit to use local Ollama)
#   $env:RAZORPAY_KEY_ID     = "rzp_test_..."   (omit for demo-mode payments)
#   $env:RAZORPAY_KEY_SECRET = "..."
#   $env:VOICE_CALL_SERVICE_URL = "http://3.92.238.46:8002/call/initiate"
```
Every value is optional; the app degrades gracefully without any of them.

### 3.3 Seed demo data
```powershell
cd backend
.\venv\Scripts\python.exe seed.py
```
Seeds: 3 vendors, several cranes + a tractor, matching GPS devices, and a
sample booking.

### 3.4 Run the backend
```powershell
cd backend\venv
.\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level warning
```
With secrets loaded (the startup script does this automatically):
```powershell
$env:GROQ_API_KEY = "..."; $env:RAZORPAY_KEY_ID = "..."; ...
.\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 3.5 Verify
```powershell
curl http://localhost:8000/            # {"message":"Equipment Tracking API is running"}
curl http://localhost:8000/db-test     # {"database":"fleet_tracking","status":"connected"}
curl http://localhost:8000/ai/status   # {"provider":"groq"|"ollama", ...}
```
Interactive API docs (Swagger UI): **http://localhost:8000/docs**

---

## 4. The APIs (grouped)

All routes are defined in `backend/venv/app/main.py`. Full request/response
detail is in `Handover-API-Reference.md`; this is the orientation.

### 4.1 Equipment & Devices
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/equipment` | List all equipment (current state) |
| GET | `/equipment/{id}` | One machine |
| POST | `/equipment` | Register a machine |
| DELETE | `/equipment/{id}` | Remove a machine (cascades devices/telemetry) |
| GET | `/devices` | List GPS devices |
| GET | `/devices/{id}` | One device |
| POST | `/devices` | Register a device to a machine |

### 4.2 Telemetry (the IoT core)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/telemetry` | **Ingest a GPS reading** (see Section 5) |
| GET | `/equipment/{id}/telemetry` | History for a machine |
| GET | `/equipment/{id}/telemetry/export` | CSV export |
| GET | `/equipment/{id}/utilization` | Utilization for one machine |
| WS | `/ws/telemetry` | WebSocket push of live updates |

### 4.3 Alerts & Geofences
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/alerts` | List alerts (filter by acknowledged) |
| GET | `/alerts/count` | Total + unacknowledged counts |
| PATCH | `/alerts/{id}/acknowledge` | Acknowledge one |
| PATCH | `/alerts/acknowledge-all` | Acknowledge all |
| GET/POST/DELETE | `/geofences[/{id}]` | Manage zones |

### 4.4 Vendors, Cranes, Bookings
| Method | Path | Purpose |
|--------|------|---------|
| GET/POST/PATCH/DELETE | `/vendors[/{id}]` | Vendor CRUD; GET one includes their cranes |
| GET | `/cranes` | Cranes enriched with vendor + active booking |
| GET | `/cranes/available?start_date&end_date` | Availability for a date range |
| PATCH | `/cranes/{id}/lifecycle` | Manual lifecycle change (repair/deceased/etc.) |
| GET | `/bookings` | List (filter by status/crane) |
| GET | `/bookings/{id}` | One booking |
| POST | `/bookings` | Create (status = pending) |
| POST | `/bookings/{id}/pay` | Mock payment (marks paid/confirmed) |
| PATCH | `/bookings/{id}/status` | Drive the booking state machine |

### 4.5 Payments (Razorpay)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/payments/config` | Returns publishable key + mode (live/demo) |
| POST | `/payments/create-order` | Create a Razorpay order for a booking |
| POST | `/payments/verify` | Verify signature; confirm booking |
| POST | `/payments/webhook` | Razorpay server-to-server events |

### 4.6 Dashboard & Reports
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/dashboard/summary` | KPIs: counts, crane status breakdown, revenue |
| GET | `/reports/utilization/{equipment_id}?start&end` | Per-machine report |
| GET | `/reports/fleet-utilization?start&end` | Fleet-wide report |

### 4.7 AI Chat & Voice
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/chat/{vendor_id}` | Chat history for a vendor |
| POST | `/chat/{vendor_id}` | Send a message, get a reply (non-streaming) |
| POST | `/chat/{vendor_id}/stream` | Send a message, stream reply via SSE |
| POST | `/chat/{vendor_id}/quick-action` | Canned prompts (status/ETA/etc.) |
| POST | `/voice/call/{vendor_id}` | Place a real AI voice call to the vendor |
| GET | `/voice/calls` | Voice call log |
| GET | `/ai/status` | Which LLM provider/model is active |

### 4.8 System
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Health check |
| GET | `/db-test` | DB connectivity check |

---

## 5. Telemetry Ingestion — Deep Dive

This is the heart of the IoT use case. When a device (or the simulator) POSTs to
`/telemetry`, the handler in `main.py` does the following, in order:

**Request body (`Telemetry` schema):**
```json
{
  "equipment_id": "CR-001",
  "device_id": "GPS-CR-001",
  "latitude": 18.5204,
  "longitude": 73.8567,
  "speed": 6.4,
  "engine_on": true,
  "timestamp": "2025-01-01T10:00:00Z",
  "signal_strength": 82
}
```

**Processing steps:**
1. **Look up the device** by `device_id`. 404 if unknown.
2. **Look up the equipment** by `equipment_id`. 404 if unknown.
3. **Derive operational status** from the reading:
   ```
   if not engine_on:        status = "stopped"
   elif speed < 1:          status = "idle"
   else:                    status = "working"
   ```
4. **Update the equipment row** — latest lat/lng, speed, engine_on, status.
5. **Insert a telemetry history row** (immutable time-series record).
6. **Update the device** — `connected = true`, `last_seen`, `signal_strength`.
7. **Run alert rules** (`services/alerts.py`):
   - `signal_strength < 50` → **low_signal** (warning)
   - `speed > 15` → **overspeed** (critical)
   - device was disconnected and is now reporting → **device_reconnected** (info)
8. **Broadcast** the update to all WebSocket clients on `/ws/telemetry`, so the
   live map moves instantly without polling.

**Try it manually:**
```powershell
$body = '{"equipment_id":"CR-001","device_id":"GPS-CR-001","latitude":18.52,"longitude":73.85,"speed":6.4,"engine_on":true,"timestamp":"2025-01-01T10:00:00Z","signal_strength":82}'
$body | Out-File -FilePath "$env:TEMP\t.json" -Encoding utf8 -NoNewline
curl.exe -s -X POST "http://localhost:8000/telemetry" -H "Content-Type: application/json" --data-binary "@$env:TEMP\t.json"
```

---

## 6. GPS Simulator — Running & Understanding It

The simulator (`backend/gps_simulator.py`) stands in for real GPS hardware. It
is the primary way telemetry enters the system in the demo.

### Run it
```powershell
cd backend
.\venv\Scripts\python.exe gps_simulator.py --interval 3
```
Flags: `--interval` seconds between updates (default 3), `--api-url` backend URL
(default `http://localhost:8000`).

### What it does
1. Calls `GET /devices` and `GET /equipment` to learn what exists.
2. Creates an in-memory `DeviceState` per device, seeded at the equipment's
   current position.
3. Every tick, for each device:
   - Advances a small **state machine**: `moving` ↔ `idle` ↔ `stopped`.
   - When moving, accelerates toward a target speed and nudges the heading,
     then converts speed+heading into a new lat/lng.
   - Fluctuates `signal_strength` slightly.
   - Clamps position to within 5 km of Pune center (18.5204, 73.8567).
   - POSTs a telemetry payload to `/telemetry`.

### Per-type movement profiles
| Type | Max speed | Behaviour |
|------|-----------|-----------|
| tractor | 25 km/h | fairly active |
| crane | 8 km/h | slow, often idle/stationary |
| excavator | 12 km/h | moderate |
| dumper | 40 km/h | fast, mostly moving |

> Because cranes are often idle and sometimes stopped, you'll naturally see a
> mix of `working` / `idle` / `stopped` statuses on the dashboard — useful for
> demoing utilization.

### Note on the two copies
There is a copy at `simulator/gps_simulator.py` as well as
`backend/gps_simulator.py`. The startup script and normal runs use the
**`backend/`** copy.

---

## 7. Frontend Setup & Walkthrough

### 7.1 Configure
`frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_MAPTILER_KEY=<maptiler key>
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_...
```
> When deployed on Vercel, `NEXT_PUBLIC_API_URL` points at the **ngrok** URL of
> the local backend instead of `localhost`.

### 7.2 Install & run
```powershell
cd frontend
npm install --legacy-peer-deps
npm run dev
```
Open **http://localhost:3000**.

### 7.3 Page-by-page tour
| Route | What to show |
|-------|-------------|
| `/` (Dashboard) | KPI cards, crane lifecycle pie chart, vendor cards, live map. This is the landing page. |
| `/tracking` | Full-screen live map; markers move as the simulator feeds data (via WebSocket). |
| `/equipment` | Table of machines with status filters; click through to detail. |
| `/equipment/[id]` | Single machine: position, status, telemetry, utilization. |
| `/devices` | GPS device connectivity (connected/last-seen/signal). |
| `/telemetry` | Raw telemetry history viewer. |
| `/alerts` | Alert feed with severity; acknowledge single/all. |
| `/analytics` | Fleet analytics charts. |
| `/bookings` | Booking list + KPI cards (total/available/repair cranes, active bookings). |
| `/bookings/new` | Booking wizard: dates → available crane → customer details → Razorpay payment → confirmation. |
| `/bookings/history` | Completed / cancelled bookings. |
| `/reports` | Utilization report: pick machine + date range → charts → **Export PDF**. |
| `/chat` | Vendor list, AI chat thread (streaming), and the **Call Vendor** voice panel. |

### 7.4 How the frontend talks to the backend
- `lib/api.ts` — a thin `fetchApi` wrapper around `fetch`; sets JSON headers and
  an `ngrok-skip-browser-warning` header (needed so ngrok doesn't return its
  interstitial HTML page to the browser).
- `lib/types.ts` — TypeScript types mirroring the backend Pydantic schemas.
- `lib/hooks/` — React hooks that fetch + poll:
  `useEquipment`, `useDevices`, `useBookings`, `useCranes`, `useDashboard`,
  `useAlerts`, and `useWebSocket` (subscribes to `/ws/telemetry`).

---

## 8. Full Execution Sequence (from cold)

The correct order matters (each tier depends on the previous):

```
1. Docker + PostgreSQL   docker start fleet_postgres
2. Ollama (optional)     ollama serve            (only if not using Groq)
3. Seed (first run only) python seed.py
4. Backend               uvicorn app.main:app --port 8000   (with env keys)
5. GPS simulator         python gps_simulator.py --interval 3
6. ngrok (public only)   ngrok http 8000
7. Frontend              npm run dev
```

**Or just run the one-command script** from the project root:
```powershell
.\start-all.ps1
```
It performs all of the above in order, is idempotent (skips what's already up),
and loads secrets from `secrets.local.ps1`. Flags: `-SkipFrontend`,
`-SkipNgrok`.

### Quick verification after start
```powershell
curl http://localhost:8000/ai/status
curl http://localhost:8000/dashboard/summary
# open http://localhost:3000
```

---

## 9. Running the Test Suite

50 integration tests cover the API surface (`backend/tests/test_api.py`).
```powershell
cd backend
.\venv\Scripts\python.exe -m pytest tests/test_api.py -v
```
> Tests hit the **live** backend, so the backend + PostgreSQL must be running
> first.

---

## 10. Session 2 Recap

- DB is Postgres 16 in Docker on 5433; tables auto-created + patched on startup.
- Backend code lives at `backend/venv/app/`; run with Uvicorn on 8000; Swagger
  at `/docs`.
- Telemetry ingestion is the core flow — 8 steps, ending in a WebSocket
  broadcast.
- The GPS simulator drives realistic movement per equipment type.
- Frontend is Next.js on 3000; `lib/hooks` + `lib/api.ts` connect it to the API.
- `start-all.ps1` runs the whole stack in one command.

> **Next session (KT-3):** end-to-end demo script, troubleshooting the common
> issues we actually hit, deployment/setup requirements, and Q&A.
