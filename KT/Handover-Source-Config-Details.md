# Handover — Source Tree, Configuration & Relevant Details

Everything needed to find your way around the code and configuration.

Repository: https://github.com/sagarchavan-teleglobal/FleetTrack.git
Project root: `.../FleetTrack/equipment-tracking-poc`

---

## 1. Source Tree Map

```
equipment-tracking-poc/
├── start-all.ps1                 # one-command startup for the whole stack
├── secrets.example.ps1           # template for local secrets (committed)
├── secrets.local.ps1             # actual secrets (GIT-IGNORED, not committed)
│
├── backend/
│   ├── gps_simulator.py          # GPS telemetry simulator (primary ingestion)
│   ├── seed.py                   # demo data seeding
│   ├── tests/
│   │   └── test_api.py           # 50 integration tests
│   └── venv/                     # Python virtual environment
│       ├── Scripts/python.exe    # the interpreter to use
│       └── app/                  # >>> APPLICATION CODE LIVES HERE <<<
│           ├── main.py           # FastAPI app + ALL routes + WS manager
│           ├── database.py       # engine + session + DB URL
│           ├── dependencies.py   # get_db()
│           ├── db_models.py      # SQLAlchemy ORM (9 tables)
│           ├── models.py         # Pydantic Equipment + status literals
│           ├── schemas.py        # request/response schemas
│           ├── migrations.py     # idempotent DDL patcher
│           └── services/
│               ├── utilization.py
│               ├── alerts.py
│               ├── bookings.py
│               ├── payment.py
│               ├── communication.py
│               └── llm.py
│
├── frontend/
│   ├── .env.local                # frontend config (API URL, map + razorpay keys)
│   ├── package.json
│   ├── app/                      # Next.js App Router pages
│   │   ├── page.tsx              # Dashboard
│   │   ├── tracking/  equipment/ (+[id])  devices/  telemetry/
│   │   ├── alerts/    analytics/
│   │   ├── bookings/ (+new/ +history/)
│   │   ├── reports/   chat/
│   │   ├── layout.tsx  globals.css
│   ├── lib/
│   │   ├── api.ts                # typed API client (fetch wrapper)
│   │   ├── types.ts              # TS types mirroring backend
│   │   └── hooks/                # useEquipment, useDevices, useBookings,
│   │                             #   useCranes, useDashboard, useAlerts, useWebSocket
│   └── components/               # layout, dashboard, map, bookings,
│                                 #   analytics, equipment, ui
│
├── mqtt/                         # DORMANT (ready for real hardware)
│   ├── docker-compose.yml        # Eclipse Mosquitto broker
│   ├── mosquitto.conf
│   └── bridge.py                 # MQTT (fleet/telemetry/#) -> POST /telemetry
│
├── simulator/
│   └── gps_simulator.py          # secondary copy of the simulator
│
└── docs/
    ├── APPLICATION_FLOW.md
    ├── VOICE_AGENT_TRANSCRIPTS.md
    └── (architecture/showcase decks)
```

> **Key oddity:** the FastAPI app package is under `backend/venv/app/`. This is
> intentional-but-unusual for the POC and is tracked in git. The Python
> interpreter is `backend/venv/Scripts/python.exe`. Recommended future cleanup:
> move the app to `backend/app/` and keep `venv` purely for the environment.

---

## 2. Configuration Files

### 2.1 `secrets.local.ps1` (git-ignored)
Loaded by `start-all.ps1`. Injects backend env vars:
```powershell
$env:GROQ_API_KEY          = "gsk_..."
$env:RAZORPAY_KEY_ID       = "rzp_test_..."
$env:RAZORPAY_KEY_SECRET   = "..."
$env:VOICE_CALL_SERVICE_URL = "http://3.92.238.46:8002/call/initiate"
```
Template: `secrets.example.ps1` (committed, values blank).

### 2.2 `frontend/.env.local`
```
NEXT_PUBLIC_API_URL=http://localhost:8000        # or the ngrok URL on Vercel
NEXT_PUBLIC_MAPTILER_KEY=<maptiler key>
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_...
```

### 2.3 Backend DB connection (`backend/venv/app/database.py`)
Hardcoded for the POC:
```python
DATABASE_URL = "postgresql+psycopg2://fleet_user:fleet_password@localhost:5433/fleet_tracking"
engine = create_engine(DATABASE_URL, echo=True)   # echo logs SQL (disable in prod)
```

### 2.4 MQTT (`mqtt/`)
Dormant. `bridge.py` env: `MQTT_HOST` (localhost), `MQTT_PORT` (1883),
`API_URL` (http://localhost:8000). Broker via `docker-compose.yml`.

---

## 3. Environment Variables (complete list)

| Variable | Where set | Default | Effect |
|----------|-----------|---------|--------|
| `GROQ_API_KEY` | secrets.local.ps1 | (unset) | Enables Groq LLM; unset → Ollama |
| `GROQ_MODEL` | env (optional) | `openai/gpt-oss-120b` | Groq model |
| `OLLAMA_HOST` | env (optional) | `http://localhost:11434` | Ollama endpoint |
| `OLLAMA_MODEL` | env (optional) | `qwen2.5:3b` | Ollama model |
| `OLLAMA_KEEP_ALIVE` | env (optional) | `30m` | Keep model warm |
| `RAZORPAY_KEY_ID` | secrets.local.ps1 | (unset → demo) | Razorpay publishable key |
| `RAZORPAY_KEY_SECRET` | secrets.local.ps1 | (unset → demo) | Razorpay secret |
| `VOICE_CALL_SERVICE_URL` | secrets.local.ps1 / code default | `http://3.92.238.46:8002/call/initiate` | Voice service endpoint |
| `NEXT_PUBLIC_API_URL` | frontend/.env.local / Vercel | `http://localhost:8000` | Backend URL for the UI |
| `NEXT_PUBLIC_MAPTILER_KEY` | frontend/.env.local | — | Map tiles |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | frontend/.env.local | — | Checkout popup |

---

## 4. Ports

| Service | Port | Notes |
|---------|------|-------|
| Backend (FastAPI/Uvicorn) | 8000 | main API |
| Frontend (Next.js) | 3000 | dev server |
| PostgreSQL | 5433 (host) → 5432 (container) | |
| Ollama | 11434 | local LLM |
| ngrok inspector | 4040 | tunnel status/URL |
| MQTT broker | 1883 (+ 9001 WS) | dormant |

---

## 5. External Dependencies & Accounts

| Dependency | Type | Account/Key needed | Failure behaviour |
|------------|------|--------------------|-------------------|
| Groq | Cloud LLM | API key (free tier) | Falls back to Ollama, then keyword replies |
| Ollama | Local LLM | none (local install) | Falls back to keyword replies |
| Razorpay | Payments | test key id + secret | Demo mode (simulated) |
| AI Voice Service | Voice calls | endpoint URL | 503 "voice channel busy" (no fallback) |
| MapTiler | Map tiles | key | Map tiles won't render |
| ngrok | Tunnel | auth token | No public access (local still works) |
| Vercel | Frontend host | account linked to repo | — |

---

## 6. Backend Python Dependencies

Installed in `backend/venv`:
- `fastapi`, `uvicorn` — web framework + server
- `sqlalchemy`, `psycopg2` (binary) — ORM + PostgreSQL driver
- `pydantic` — validation
- `requests` — outbound HTTP (Groq, Ollama, voice service)
- `razorpay` — payments
- `groq` — (optional; Groq is also reachable via plain `requests`)
- `httpx`, `pytest` — testing
- `paho-mqtt` — MQTT bridge (dormant path)

## 7. Frontend Dependencies (`frontend/package.json`)
- `next` 16.3.1, `react`/`react-dom` 19
- `leaflet`, `react-leaflet` — maps
- `recharts` — charts
- `lucide-react` — icons
- `html2canvas`, `jspdf` — PDF export
- `tailwindcss` v4, `typescript`, `eslint` (dev)

---

## 8. Seed Data (`backend/seed.py`)

Running `seed.py` creates:
- 3 **vendors** (e.g. Rajesh Sharma / Sharma Cranes, etc.)
- Several **cranes** + a **tractor** with hourly rates and vendor assignments
- Matching **GPS devices** (e.g. `GPS-CR-001` → `CR-001`)
- One sample **booking** (confirmed) to populate the dashboard

Equipment IDs follow a readable convention: `CR-00x` (crane), `TR-00x`
(tractor), with devices `GPS-<equipment id>`.

---

## 9. Tests (`backend/tests/test_api.py`)

50 integration tests (httpx + pytest) exercising all endpoint groups against a
running instance. Run:
```powershell
cd backend
.\venv\Scripts\python.exe -m pytest tests/test_api.py -v
```

---

## 10. Startup Script (`start-all.ps1`) — What It Does

1. Loads `secrets.local.ps1` if present.
2. Starts Docker Desktop (waits for the daemon) and the `fleet_postgres`
   container.
3. Starts Ollama if not already running.
4. Starts the backend with all env vars; waits until `/` responds.
5. Starts the GPS simulator.
6. Starts ngrok on port 8000 and reports the public URL.
7. Starts the frontend dev server.
Idempotent: detects and reuses anything already running. Flags: `-SkipFrontend`,
`-SkipNgrok`.

---

## 11. Git & Secrets Hygiene

- `.gitignore` excludes `secrets.local.ps1` — verify with
  `git check-ignore -v secrets.local.ps1`.
- Never commit API keys. If a key leaks, rotate it at the provider.
- `secrets.example.ps1` (blank template) is the only secrets-shaped file that
  should be committed.

---

## 12. Where to Look For…

| I need to… | Go to |
|------------|-------|
| Add/change an endpoint | `backend/venv/app/main.py` (+ a service in `services/`) |
| Change the DB schema | `backend/venv/app/db_models.py` (+ `migrations.py` for existing DBs) |
| Change telemetry status logic | `main.py` `/telemetry` handler |
| Change alert rules | `services/alerts.py` |
| Change booking/lifecycle rules | `services/bookings.py` |
| Change payment behaviour | `services/payment.py` |
| Change chat/voice prompts or providers | `services/communication.py`, `services/llm.py` |
| Change a UI page | `frontend/app/<route>/page.tsx` |
| Change API calls from UI | `frontend/lib/api.ts` |
| Change simulator behaviour | `backend/gps_simulator.py` |
| Change startup sequence | `start-all.ps1` |
