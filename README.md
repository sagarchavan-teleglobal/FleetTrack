# FleetTrack — Fleet Management & Crane Booking System

A full-stack POC for real-time fleet tracking, crane booking with payments, utilization analytics, and AI-powered vendor communication.

## Features

- **Real-Time GPS Tracking** — Live map with equipment positions, WebSocket push updates, history trails
- **Crane Booking System** — Availability check, date-range booking, lifecycle state machine (available → booked → working → repair → deceased)
- **Razorpay Payments** — Live checkout integration (UPI, cards, netbanking) with signature verification
- **Utilization Reports** — Per-crane and fleet-wide analytics with date range, charts, and PDF export
- **AI Chat Agent** — Local LLM (Ollama/Qwen 2.5 3B) with real fleet context, streaming responses via SSE
- **AI Voice Agent** — Generates structured call transcripts and summaries (Twilio/Bland.ai ready)
- **Alert Engine** — Low signal, overspeed, disconnection detection with acknowledge workflow
- **Geofencing** — Create and visualize boundary zones on the map
- **Vendor Management** — CRUD with crane ownership, contact details, dashboard cards

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js 16)                      │
│  Dashboard │ Bookings │ Reports │ Chat/Voice │ Map │ Equipment   │
└──────┬──────────┬──────────┬──────────┬──────────┬──────────────┘
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

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, SQLAlchemy, Pydantic v2 |
| Frontend | Next.js 16, TypeScript, Tailwind CSS, Recharts, Leaflet |
| Database | PostgreSQL 16 (Docker) |
| AI/LLM | Ollama + Qwen 2.5 3B (local, no API keys) |
| Payments | Razorpay (test mode) |
| Real-time | WebSocket (telemetry), Server-Sent Events (chat streaming) |
| Maps | MapTiler + React Leaflet |
| PDF Export | html2canvas + jsPDF |
| Testing | pytest + httpx (50 integration tests) |

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- Docker
- Ollama (`ollama serve` + `ollama pull qwen2.5:3b`)

### 1. Database

```bash
docker run -d --name fleet_postgres \
  -e POSTGRES_DB=fleet_tracking \
  -e POSTGRES_USER=fleet_user \
  -e POSTGRES_PASSWORD=fleet_password \
  -p 5433:5432 postgres:16
```

### 2. Backend

```bash
cd backend/venv

# Set payment keys (optional — works in demo mode without them)
export RAZORPAY_KEY_ID=rzp_test_xxxxx
export RAZORPAY_KEY_SECRET=xxxxx

# Seed data
python ../seed.py

# Run
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```

Open http://localhost:3000

### 4. GPS Simulator

```bash
cd backend
python gps_simulator.py --interval 3
```

### 5. Ollama (for AI chat)

```bash
ollama serve
ollama pull qwen2.5:3b
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RAZORPAY_KEY_ID` | (empty — demo mode) | Razorpay test/live key |
| `RAZORPAY_KEY_SECRET` | (empty — demo mode) | Razorpay secret |
| `OLLAMA_HOST` | http://localhost:11434 | Ollama server URL |
| `OLLAMA_MODEL` | qwen2.5:3b | Chat model |
| `OLLAMA_KEEP_ALIVE` | 30m | Model memory retention |

Frontend (`frontend/.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_MAPTILER_KEY=your_key
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxxx
```

## Frontend Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard — fleet KPIs, revenue, lifecycle pie chart, vendor cards, live map |
| `/bookings` | Crane bookings — KPI cards, status filters, pay/start/complete/cancel actions |
| `/bookings/new` | New booking wizard — dates → crane → details → Razorpay checkout |
| `/bookings/history` | Completed and cancelled bookings |
| `/reports` | Utilization reports — date range, charts, PDF export |
| `/chat` | AI chat + voice — vendor messaging with streaming LLM, voice call transcripts |
| `/equipment` | Equipment list with search and status filters |
| `/tracking` | Full-page live tracking map |
| `/telemetry` | Telemetry data viewer |
| `/analytics` | Fleet analytics and utilization charts |
| `/alerts` | Alert feed with severity levels and acknowledge |
| `/devices` | GPS device connectivity table |

## Testing

```bash
cd backend
python -m pytest tests/test_api.py -v
```

50 integration tests covering all endpoints. Requires backend + PostgreSQL running.

## Documentation

- `docs/APPLICATION_FLOW.md` — Full system architecture, all API endpoints, module details
- `docs/VOICE_AGENT_TRANSCRIPTS.md` — Sample AI voice call transcripts with structured summaries

## Seed Data

`python seed.py` creates:
- 3 vendors (Rajesh Sharma, Priya Mehta, Anil Kulkarni)
- 5 cranes + 1 tractor with GPS devices
- 1 sample confirmed booking (Metro Construction Corp, Rs. 7.68L)

## License

Private — POC for internal use.

## Repository

https://github.com/sagarchavan-teleglobal/FleetTrack.git
