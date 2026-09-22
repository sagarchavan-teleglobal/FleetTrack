# Handover — High-Level Design (HLD)

**Project:** FleetTrack – IoT Equipment Tracking & Crane Booking
**Document type:** High-Level Design
**Scope:** System context, logical architecture, components, integrations,
data flows, non-functional aspects.

---

## 1. Purpose & Scope

FleetTrack manages heavy construction equipment across its operational and
commercial lifecycle:
- Real-time GPS/IoT tracking and monitoring
- Alerting and geofencing
- Crane rental bookings with online payment
- Utilization analytics and reporting
- AI-assisted vendor communication (chat + voice)

This HLD describes the system at the component and integration level. Class-,
function-, and table-level detail is in the **LLD/TDD** document.

---

## 2. System Context

```
        ┌──────────────┐        ┌───────────────────────────┐
        │  Fleet /      │        │  External Services         │
        │  Ops User     │        │  - Groq (LLM)              │
        │  (browser)    │        │  - Ollama (local LLM)      │
        └──────┬───────┘        │  - Razorpay (payments)     │
               │                │  - AI Voice Service         │
               │ HTTPS          │  - MapTiler (map tiles)     │
               ▼                └──────────────┬─────────────┘
   ┌────────────────────────┐                 │
   │  FleetTrack Frontend    │                 │
   │  (Next.js on Vercel)    │                 │
   └───────────┬────────────┘                 │
               │ REST / WS / SSE               │ (backend calls out)
               ▼                               │
   ┌────────────────────────┐◀────────────────┘
   │  FleetTrack Backend     │
   │  (FastAPI)              │
   └───────────┬────────────┘
               │ SQL
               ▼
   ┌────────────────────────┐        ┌──────────────────────┐
   │  PostgreSQL             │        │  IoT / Ingestion      │
   │  (Docker)               │◀───────│  GPS Simulator today; │
   └────────────────────────┘  POST  │  MQTT + real devices  │
                              /telemetry│  in future           │
                                       └──────────────────────┘
```

---

## 3. Logical Architecture

Three tiers plus ingestion and external integrations.

### 3.1 Presentation Tier — Next.js Frontend
- App-Router SPA-style UI, TypeScript, Tailwind.
- Responsibilities: dashboards, live map, equipment/device views, booking
  wizard, reports (+PDF), chat/voice UI, alerts.
- Communicates via REST (CRUD/queries), WebSocket (live telemetry), SSE
  (chat streaming).
- Deployed on Vercel; talks to the backend via `NEXT_PUBLIC_API_URL`.

### 3.2 Application Tier — FastAPI Backend
- All business logic and API endpoints.
- Route layer (`main.py`) → service layer (`services/*`) → data layer
  (SQLAlchemy models).
- Stateless except for in-memory WebSocket connection registry.
- Integrates outward to LLM, payments, and voice providers.

### 3.3 Data Tier — PostgreSQL
- 9 relational tables (see LLD).
- Time-series telemetry stored as append rows; current state denormalized onto
  the `equipment` row for fast reads.

### 3.4 Ingestion Tier
- **Now:** Python GPS simulator POSTing to `/telemetry`.
- **Future:** real GPS hardware → MQTT broker (Mosquitto) → `mqtt/bridge.py` →
  same `/telemetry` endpoint. The API contract is unchanged, so hardware can be
  introduced without backend changes.

### 3.5 External Integrations
| Integration | Purpose | Mode |
|-------------|---------|------|
| Groq LLM | Chat replies, voice transcript generation | Cloud, default |
| Ollama LLM | Local fallback LLM | Local |
| Razorpay | Booking payments | Test mode |
| AI Voice Service | Real outbound phone calls | Live external service |
| MapTiler | Map tiles | Cloud |
| ngrok | Public tunnel to local backend | Dev/demo |

---

## 4. Component Model

```
Frontend (Next.js)
 ├─ Pages: dashboard, tracking, equipment, devices, telemetry, alerts,
 │         analytics, bookings(+new,+history), reports, chat
 ├─ lib/api.ts  (typed API client)
 ├─ lib/hooks/* (data fetching + WebSocket)
 └─ components/* (layout, dashboard, map, bookings, analytics, equipment, ui)

Backend (FastAPI)
 ├─ main.py           (routes, CORS, WebSocket manager, startup)
 ├─ database.py       (engine, session)
 ├─ dependencies.py   (get_db)
 ├─ db_models.py      (ORM: 9 tables)
 ├─ models.py         (Pydantic Equipment + status literals)
 ├─ schemas.py        (request/response schemas)
 ├─ migrations.py     (idempotent DDL)
 ├─ seed.py           (demo data)
 └─ services/
     ├─ utilization.py     (usage math)
     ├─ alerts.py          (rule engine)
     ├─ bookings.py        (availability, lifecycle state machine, mock pay)
     ├─ payment.py         (Razorpay orders + verification)
     ├─ communication.py   (chat + voice orchestration)
     └─ llm.py             (Groq/Ollama provider abstraction)

Ingestion
 ├─ backend/gps_simulator.py
 └─ mqtt/ (broker + bridge, dormant)
```

---

## 5. Key Functional Flows (High Level)

### 5.1 Telemetry → Live View
Device/simulator POSTs telemetry → backend derives status, updates current
state, stores history, evaluates alert rules, and broadcasts over WebSocket →
frontend map updates in real time.

### 5.2 Booking → Payment → Lifecycle
Availability check → create pending booking → Razorpay order → checkout →
signature verification → booking confirmed and crane lifecycle transitions
(`available → booked`). Further status changes drive `working`, `completed`,
etc., with matching lifecycle updates.

### 5.3 Utilization Reporting
Telemetry in a date range → utilization service computes time in each status →
uptime and utilization percentages → charts and PDF export.

### 5.4 AI Chat
User message → backend builds a fleet-grounded prompt → LLM (Groq/Ollama)
streams reply via SSE → conversation persisted.

### 5.5 AI Voice
"Call Vendor" → backend assembles call context → external voice service dials
the vendor → call logged; transcript/summary attached on completion. No mock
fallback.

---

## 6. Data Design Summary

| Entity | Role |
|--------|------|
| Equipment | Machines; dual status (operational + commercial lifecycle) |
| Vendor | Owner of equipment; chat/voice counterpart |
| Device | GPS tracker attached to equipment |
| Telemetry | Append-only GPS time series |
| Booking | Crane rental with payment + status state machine |
| Alert | Output of the rule engine |
| Geofence | Boundary zone (polygon) |
| ChatMessage | Vendor chat thread entries |
| VoiceCall | AI call log with transcript/summary |

Relationships and columns: see **Handover-LLD-TDD.md**.

---

## 7. Non-Functional Aspects

| Aspect | Approach |
|--------|----------|
| Real-time | WebSocket push for telemetry; SSE for chat streaming |
| Performance | Groq chat ~1–2s; local Ollama ~3–6s; current state denormalized for fast dashboard reads |
| Resilience | Graceful degradation: LLM→keyword fallback; payments→demo mode; voice→"busy" message |
| Scalability | Stateless backend can scale horizontally; DB is the shared state |
| Portability | Dockerized DB; hardware-agnostic ingestion contract |
| Observability | SQLAlchemy echo logging; `/ai/status`, `/db-test`, `/` health endpoints |
| Security (POC-level) | Secrets via env/gitignored file; Razorpay signature verification; CORS open (to tighten) |
| Testability | 50 integration tests against a live instance |

---

## 8. Deployment View

```
Vercel (frontend)  ──HTTPS──►  ngrok (public URL)  ──►  local backend :8000
                                                            │
                                    ┌───────────────────────┼──────────────┐
                                    ▼                       ▼               ▼
                              PostgreSQL(Docker)      Ollama(:11434)   Groq/Razorpay/Voice
```
- Frontend: permanent (Vercel).
- Backend/DB/LLM: dev machine, exposed via ngrok (demo model).
- Future: cloud-hosted backend + managed PostgreSQL + Alembic migrations for a
  stable, always-on deployment (see KT-3 §3.4).

---

## 9. Assumptions & Constraints

- Single-tenant, single fleet operator; no auth in the POC.
- Windows-first tooling (PowerShell start script).
- Free ngrok tier: tunnel URL can change on restart (requires Vercel env
  update + redeploy).
- Voice calling depends on an external third-party service's availability.
- Payments are test-mode only; no settlement/refund logic beyond status.

---

## 10. Traceability to Code

| HLD component | Source |
|---------------|--------|
| Route layer | `backend/venv/app/main.py` |
| Service layer | `backend/venv/app/services/*.py` |
| Data layer | `backend/venv/app/db_models.py`, `database.py` |
| Ingestion | `backend/gps_simulator.py`, `mqtt/` |
| Frontend | `frontend/app/*`, `frontend/lib/*`, `frontend/components/*` |
| Orchestration | `start-all.ps1`, `secrets.local.ps1` |
