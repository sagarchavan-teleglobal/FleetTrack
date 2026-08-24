# FleetTrack — Complete Application Flow

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Data Flow](#data-flow)
4. [Component Breakdown](#component-breakdown)
5. [Database Schema](#database-schema)
6. [API Reference](#api-reference)
7. [Frontend Pages & Features](#frontend-pages--features)
8. [Real-Time Data Pipeline](#real-time-data-pipeline)
9. [Alert Engine](#alert-engine)
10. [Geofencing](#geofencing)
11. [MQTT Integration](#mqtt-integration)
12. [How to Run](#how-to-run)
13. [Technology Stack](#technology-stack)

---

## System Overview

FleetTrack is a real-time fleet and equipment tracking system designed for construction and agricultural equipment. It tracks GPS location, movement, speed, engine state, device connectivity, and calculates utilization metrics.

The system consists of 5 main components:

| Component | Role |
|-----------|------|
| GPS Simulator | Generates telemetry data for multiple equipment |
| MQTT Broker | Lightweight message transport for IoT devices |
| FastAPI Backend | Ingests telemetry, stores data, serves API, broadcasts WebSocket |
| PostgreSQL | Persistent storage for equipment, devices, telemetry, alerts, geofences |
| Next.js Frontend | Real-time dashboard with maps, charts, alerts, and dark mode |

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         DATA SOURCES                                  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐     ┌─────────────────┐     ┌───────────────┐ │
│  │  GPS Simulator   │     │  Real GPS Device │     │  Phone GPS    │ │
│  │  (Python script) │     │  (ESP32+SIM7600) │     │  (Browser API)│ │
│  └────────┬────────┘     └────────┬────────┘     └──────┬────────┘ │
│           │                       │                      │          │
│           │ HTTP POST             │ MQTT                 │ HTTP POST│
│           │                       │                      │          │
└───────────┼───────────────────────┼──────────────────────┼──────────┘
            │                       │                      │
            │                       ▼                      │
            │              ┌─────────────────┐             │
            │              │  MQTT Broker     │             │
            │              │  (Mosquitto)     │             │
            │              │  Port 1883       │             │
            │              └────────┬────────┘             │
            │                       │                      │
            │                       ▼                      │
            │              ┌─────────────────┐             │
            │              │  Bridge Service  │             │
            │              │  (bridge.py)     │             │
            │              │  MQTT → HTTP     │             │
            │              └────────┬────────┘             │
            │                       │                      │
            ▼                       ▼                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         BACKEND (FastAPI)                             │
│                         Port 8000                                     │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    POST /telemetry                              │ │
│  │                                                                │ │
│  │  1. Validate device exists                                     │ │
│  │  2. Update device connectivity (connected, last_seen, signal)  │ │
│  │  3. Find equipment                                             │ │
│  │  4. Determine status (working/idle/stopped)                    │ │
│  │  5. Update equipment state (lat, lng, speed, engine, status)   │ │
│  │  6. Store telemetry record                                     │ │
│  │  7. Check alert rules (low signal, overspeed, reconnection)    │ │
│  │  8. Commit transaction                                         │ │
│  │  9. Broadcast via WebSocket to all connected clients           │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Equipment CRUD   │  │  Devices CRUD    │  │  Alerts Engine   │  │
│  │  GET/POST/DELETE  │  │  GET/POST        │  │  GET/PATCH       │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Telemetry Hist.  │  │  Utilization     │  │  Geofences       │  │
│  │  GET + CSV Export │  │  Calculation     │  │  GET/POST/DELETE  │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  WebSocket: /ws/telemetry                                      │ │
│  │  Broadcasts real-time updates to all connected frontend clients│ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         PostgreSQL                                    │
│                         Port 5433 (Docker)                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐   │
│  │ equipment  │  │  devices   │  │ telemetry  │  │   alerts   │   │
│  │ (current   │  │ (GPS/IoT   │  │ (history   │  │ (triggered │   │
│  │  state)    │  │  tracker)  │  │  records)  │  │  events)   │   │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘   │
│                                                                      │
│  ┌────────────┐                                                     │
│  │ geofences  │                                                     │
│  │ (polygon   │                                                     │
│  │  zones)    │                                                     │
│  └────────────┘                                                     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ REST API + WebSocket
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                            │
│                         Port 3000                                     │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Real-Time Layer                                               │ │
│  │  • WebSocket connection (ws://localhost:8000/ws/telemetry)     │ │
│  │  • Auto-reconnect with exponential backoff                    │ │
│  │  • Falls back to HTTP polling (5s) if WS unavailable          │ │
│  │  • When WS connected, polling reduced to 30s (sync only)      │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐│
│  │Dashboard │ │Equipment │ │Tracking  │ │Telemetry │ │Analytics ││
│  │KPIs+Map  │ │List+CRUD │ │Map+Trail │ │History   │ │Charts    ││
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘│
│                                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                           │
│  │Alerts    │ │Devices   │ │Equipment │                           │
│  │Notify    │ │Status    │ │Detail    │                           │
│  └──────────┘ └──────────┘ └──────────┘                           │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Telemetry Ingestion (every 5 seconds per device)

```
1. Simulator/Device generates GPS packet:
   {equipment_id, device_id, lat, lng, speed, engine_on, timestamp, signal_strength}

2. Packet arrives at POST /telemetry

3. Backend processes:
   ├── Validates device registration
   ├── Updates device connectivity state
   ├── Determines equipment status:
   │   • engine_on=false         → "stopped"
   │   • engine_on=true, speed<1 → "idle"
   │   • engine_on=true, speed≥1 → "working"
   ├── Updates equipment current state (lat, lng, speed, status)
   ├── Stores telemetry record in history table
   ├── Runs alert rules:
   │   • signal_strength < 50%   → "low_signal" warning
   │   • speed > 15 km/h        → "overspeed" critical
   │   • device was disconnected → "device_reconnected" info
   ├── Commits transaction
   └── Broadcasts via WebSocket to all connected clients

4. Frontend receives WebSocket message:
   ├── Updates equipment position on map (smooth animation)
   ├── Updates KPI cards
   ├── Updates alert badge count
   └── Updates equipment list status
```

### User Interactions

```
View Dashboard     → GET /equipment + GET /devices → KPIs + Map
View Equipment     → GET /equipment → Table with search/filters
Add Equipment      → POST /equipment + POST /devices → New machine + GPS device
View Detail        → GET /equipment/{id} + GET /utilization + GET /telemetry
View Telemetry     → GET /equipment/{id}/telemetry → History table
Export CSV         → GET /equipment/{id}/telemetry/export → Download file
View Analytics     → GET /equipment + GET /utilization (per equipment) → Charts
View Alerts        → GET /alerts → Alert cards with acknowledge
Acknowledge Alert  → PATCH /alerts/{id}/acknowledge
Create Geofence    → POST /geofences → Polygon zone on map
Delete Geofence    → DELETE /geofences/{id}
Toggle Trails      → GET /equipment/{id}/telemetry → Polyline on map
Toggle Dark Mode   → localStorage update → CSS class toggle
```

---

## Component Breakdown

### Backend Files

```
backend/venv/app/
├── main.py              # FastAPI app, all routes, WebSocket, CORS
├── database.py          # SQLAlchemy engine + session factory
├── db_models.py         # ORM models: Equipment, Telemetry, Device, Alert, Geofence
├── models.py            # Pydantic response model (Equipment)
├── schemas.py           # Pydantic request schemas (Telemetry, EquipmentCreate, DeviceCreate)
├── device_models.py     # Pydantic Device response model
├── dependencies.py      # get_db() dependency injection
└── services/
    ├── utilization.py   # calculate_utilization() — working/idle/offline time
    └── alerts.py        # check_alerts() — rule-based alert generation
```

### Frontend Files

```
frontend/
├── app/
│   ├── layout.tsx           # Root layout + ThemeProvider + Sidebar
│   ├── page.tsx             # Dashboard (KPIs + Live Map + WS badge)
│   ├── globals.css          # Tailwind + dark mode variant
│   ├── equipment/
│   │   ├── page.tsx         # Equipment list + search/filters + Add modal
│   │   └── [id]/page.tsx    # Equipment detail + telemetry + utilization
│   ├── tracking/page.tsx    # Live map + trails + geofences
│   ├── telemetry/page.tsx   # Telemetry history + CSV export
│   ├── analytics/page.tsx   # Fleet charts + per-equipment utilization
│   ├── alerts/page.tsx      # Alert list with acknowledge
│   └── devices/page.tsx     # Device connectivity table
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx      # Navigation + alert badge + theme toggle
│   │   └── ThemeProvider.tsx # Dark mode context + localStorage
│   ├── dashboard/
│   │   └── KpiCard.tsx      # Metric card with icon + color
│   ├── map/
│   │   ├── FleetMap.tsx         # Leaflet map + tiles + markers + geofences
│   │   ├── EquipmentMarker.tsx  # Custom SVG pin + popup + smooth animation
│   │   ├── GeofenceLayer.tsx    # Polygon rendering with delete
│   │   ├── HistoryTrail.tsx     # Polyline + status dots + tooltips
│   │   ├── DynamicFleetMap.tsx  # SSR-safe wrapper
│   │   └── DynamicHistoryTrail.tsx
│   ├── equipment/
│   │   └── AddEquipmentModal.tsx # Create equipment form
│   ├── analytics/
│   │   ├── UtilizationDonut.tsx  # Recharts pie chart
│   │   └── EquipmentUtilizationTable.tsx
│   └── ui/
│       ├── StatusBadge.tsx  # Color-coded status indicator
│       ├── LoadingState.tsx # Spinner
│       ├── ErrorState.tsx   # Error card with retry
│       └── EmptyState.tsx   # No data placeholder
├── lib/
│   ├── api.ts           # Centralized fetch client (all endpoints)
│   ├── types.ts         # TypeScript interfaces matching API
│   ├── utils.ts         # formatDuration, formatPercent, timeAgo
│   └── hooks/
│       ├── useEquipment.ts   # Polling + WebSocket merge
│       ├── useDevices.ts     # Polling
│       ├── useTelemetry.ts   # On-demand fetch
│       ├── useUtilization.ts # On-demand fetch
│       ├── useAlerts.ts      # Polling + acknowledge actions
│       ├── useGeofences.ts   # CRUD operations
│       └── useWebSocket.ts   # WS connection + auto-reconnect
└── .env.local           # NEXT_PUBLIC_API_URL + NEXT_PUBLIC_MAPTILER_KEY
```

---

## Database Schema

### equipment (current machine state)

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(50) PK | e.g. "TR-001" |
| name | VARCHAR(100) | "Tractor 001" |
| equipment_type | VARCHAR(50) | tractor/crane/excavator/dumper |
| latitude | FLOAT | Current position |
| longitude | FLOAT | Current position |
| speed | FLOAT | Current speed (km/h) |
| engine_on | BOOLEAN | Engine state |
| status | VARCHAR(20) | working/idle/stopped |

### devices (GPS tracker state)

| Column | Type | Description |
|--------|------|-------------|
| device_id | VARCHAR(50) PK | e.g. "GPS-TR-001" |
| equipment_id | VARCHAR(50) FK | Links to equipment.id |
| connected | BOOLEAN | Current connectivity |
| last_seen | DATETIME | Last telemetry timestamp |
| signal_strength | INTEGER | 0-100% |

### telemetry (historical GPS packets)

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| equipment_id | VARCHAR(50) FK | Links to equipment.id |
| device_id | VARCHAR(50) | GPS device that sent it |
| latitude | FLOAT | Position at this time |
| longitude | FLOAT | Position at this time |
| speed | FLOAT | Speed at this time |
| engine_on | BOOLEAN | Engine state at this time |
| timestamp | DATETIME | When the reading was taken |
| signal_strength | INTEGER | GPS signal at this time |
| status | VARCHAR(20) | Calculated status at ingest |

### alerts (triggered events)

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| equipment_id | VARCHAR(50) | Which equipment triggered it |
| alert_type | VARCHAR(50) | low_signal/overspeed/device_reconnected |
| severity | VARCHAR(20) | info/warning/critical |
| message | VARCHAR(500) | Human-readable description |
| timestamp | DATETIME | When alert was triggered |
| acknowledged | BOOLEAN | Has operator seen it |

### geofences (boundary zones)

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| name | VARCHAR(100) | "Construction Site A" |
| polygon | VARCHAR(5000) | JSON: [[lat,lng], ...] |
| created_at | DATETIME | When created |

---

## API Reference

### Equipment

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /equipment | List all equipment (current state) |
| GET | /equipment/{id} | Single equipment |
| POST | /equipment | Create new equipment |
| DELETE | /equipment/{id} | Delete equipment + devices + telemetry |

### Telemetry

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /telemetry | Ingest GPS packet (main data pipeline) |
| GET | /equipment/{id}/telemetry | History for one equipment |
| GET | /equipment/{id}/telemetry/export | Download CSV |

### Utilization

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /equipment/{id}/utilization | Calculated metrics |

### Devices

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /devices | List all GPS devices |
| GET | /devices/{id} | Single device |
| POST | /devices | Register new device |

### Alerts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /alerts | List alerts (filter: ?acknowledged=true/false&limit=50) |
| GET | /alerts/count | Unacknowledged + total count |
| PATCH | /alerts/{id}/acknowledge | Mark one alert as seen |
| PATCH | /alerts/acknowledge-all | Mark all as seen |

### Geofences

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /geofences | List all zones |
| POST | /geofences | Create zone (params: name, polygon JSON) |
| DELETE | /geofences/{id} | Remove zone |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| ws://localhost:8000/ws/telemetry | Real-time telemetry broadcast |

WebSocket message format:
```json
{
  "type": "telemetry",
  "equipment_id": "TR-001",
  "device_id": "GPS-TR-001",
  "latitude": 18.5204,
  "longitude": 73.8567,
  "speed": 8.5,
  "engine_on": true,
  "status": "working",
  "signal_strength": 92,
  "timestamp": "2026-08-24T10:00:00"
}
```

---

## Frontend Pages & Features

### Dashboard (/)
- 6 KPI cards: Total, Working, Idle, Stopped, GPS Connected, GPS Disconnected
- Live map with equipment markers (color-coded by status)
- "Live" / "Polling" badge showing WebSocket connection status
- 5-second auto-refresh

### Equipment (/equipment)
- Table with all equipment
- Search by name or ID
- Filter by status (working/idle/stopped)
- Filter by type (tractor/crane/excavator/dumper)
- "Add Equipment" button → modal form
- Click row → detail page

### Equipment Detail (/equipment/[id])
- Header: name, ID, type, status badge
- 6 KPI cards: speed, engine, GPS, signal, uptime, utilization
- Current position map
- Utilization breakdown (progress bars: working/idle/stopped)
- Recent telemetry table (last 20 records)

### Live Tracking (/tracking)
- Full-page map with all equipment markers
- "Show Trails" toggle → polyline history per equipment
- "Add Geofence" → create zone around current fleet position
- Equipment sidebar with status + trail color indicators
- Geofence list with delete
- Geofence polygons rendered on map (blue dashed)

### Telemetry (/telemetry)
- Equipment selector dropdown
- Status filter
- 100-record table (most recent first)
- "Export CSV" button → downloads file

### Analytics (/analytics)
- Fleet-wide KPIs: utilization %, uptime %, working time, total observed
- Donut chart: working/idle/stopped time distribution
- Per-equipment utilization table with progress bars

### Alerts (/alerts)
- Color-coded alert cards (red=critical, amber=warning, blue=info)
- Acknowledge button per alert
- "Acknowledge All" bulk action
- Alert badge in sidebar with unacknowledged count

### Devices (/devices)
- Device table: ID, equipment, connection status, signal bar, last seen
- Green/red connectivity indicators

### Dark Mode
- Toggle via sun/moon icon in sidebar footer
- Persists in localStorage
- Respects system preference on first visit
- Smooth transition animation

---

## Real-Time Data Pipeline

```
Telemetry Packet (every 5s per device)
         │
         ▼
    POST /telemetry
         │
         ├── DB: Update equipment table (current state)
         ├── DB: Update device table (connectivity)
         ├── DB: Insert telemetry record (history)
         ├── DB: Insert alert (if rules triggered)
         │
         ▼
    WebSocket Broadcast
         │
         ├── Frontend: useEquipment hook receives WS message
         ├── Frontend: Merges into React state (no re-fetch needed)
         ├── Frontend: Map marker animates to new position
         ├── Frontend: KPI cards update
         └── Frontend: Status badges change color
```

### Fallback Strategy
- If WebSocket disconnects: automatic reconnect with exponential backoff (1s → 2s → 4s → ... → 30s max)
- During disconnection: HTTP polling resumes at 5-second intervals
- When WS reconnects: polling reduces to 30s (sync-only backup)

---

## Alert Engine

### Rules (checked on every telemetry ingestion)

| Rule | Condition | Severity | Message |
|------|-----------|----------|---------|
| Low Signal | signal_strength < 50 | warning | "GPS signal critically low: {value}%" |
| Overspeed | speed > 15 km/h | critical | "Equipment exceeding speed limit: {value} km/h" |
| Device Reconnect | device was disconnected, now sending data | info | "GPS device reconnected after disconnection" |

### Alert Lifecycle
1. Telemetry arrives → rules evaluated
2. If condition met → AlertDB record created (acknowledged=false)
3. Frontend polls /alerts/count every 10s → badge updates
4. Operator views /alerts page → sees color-coded cards
5. Operator clicks acknowledge → PATCH request → alert marked done

---

## Geofencing

### Creating a Geofence
1. User clicks "Add Geofence" on Live Tracking page
2. Enters zone name
3. System creates ~200m rectangle centered on fleet's average position
4. Polygon stored as JSON: [[lat1,lng1], [lat2,lng2], [lat3,lng3], [lat4,lng4]]
5. Rendered on map as blue dashed polygon

### Geofence Display
- Visible on Live Tracking map
- Click polygon → popup with name, date, delete button
- Listed in sidebar with delete option

---

## MQTT Integration

### Topic Structure
```
fleet/telemetry/{equipment_id}    — GPS telemetry packets
```

### Flow
```
GPS Device publishes to: fleet/telemetry/TR-001
         │
         ▼
    Mosquitto Broker (port 1883)
         │
         ▼
    bridge.py subscribes to: fleet/telemetry/#
         │
         ▼
    Parses JSON → POST http://localhost:8000/telemetry
         │
         ▼
    Normal backend processing (same as HTTP direct)
```

### Running MQTT Mode
```bash
# Start broker
cd mqtt && docker-compose up -d

# Start bridge
python mqtt/bridge.py

# Start simulator in MQTT mode
python simulator/gps_simulator.py --mqtt
```

---

## How to Run

### Prerequisites
- Docker Desktop
- Node.js 18+
- Python 3.11+

### Start Everything

```bash
# 1. PostgreSQL
docker run -d --name fleet_postgres \
  -e POSTGRES_DB=fleet_tracking \
  -e POSTGRES_USER=fleet_user \
  -e POSTGRES_PASSWORD=fleet_password \
  -p 5433:5432 postgres:16

# 2. Backend (creates tables on first run)
cd backend
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 3. Seed database (first time only)
.\venv\Scripts\python.exe seed.py

# 4. Frontend
cd frontend
npm run dev

# 5. Simulator
cd simulator
..\backend\venv\Scripts\python.exe gps_simulator.py
```

### Access
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js | 16.3 |
| UI | Tailwind CSS | 4.x |
| Language | TypeScript | 5.x |
| Map | React Leaflet + MapTiler | 4.x |
| Charts | Recharts | 2.x |
| Icons | Lucide React | 0.468 |
| Backend | FastAPI | 0.1.0 |
| ORM | SQLAlchemy | 2.x |
| Database | PostgreSQL | 16 |
| Validation | Pydantic | 2.x |
| Real-time | WebSocket (native) | — |
| IoT Transport | MQTT (Mosquitto) | 2.x |
| Container | Docker | — |
| Version Control | Git + GitHub | — |

---

## Simulator Modes

| Mode | Command | Transport |
|------|---------|-----------|
| HTTP (default) | `python gps_simulator.py` | Direct POST to /telemetry |
| MQTT | `python gps_simulator.py --mqtt` | Publish to MQTT broker |

### Simulated Equipment

| ID | Name | Type | Behavior |
|----|------|------|----------|
| TR-001 | Tractor 001 | Tractor | Fast movement, 70% working, max 12 km/h |
| CR-001 | Crane 001 | Crane | Slow/stationary, 40% working, max 3 km/h |

### Simulated Events
- 5% chance of device disconnection per tick (lasts 3-6 ticks = 15-30 seconds)
- Random directional movement when working
- Signal strength varies by operational state (40-100%)
- Status cycles through working → idle → stopped

---

*Document generated: August 24, 2026*
*Repository: https://github.com/sagarchavan-teleglobal/FleetTrack.git*
