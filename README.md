# FleetTrack - Equipment Tracking POC

A real-time fleet and equipment tracking dashboard for construction/agricultural equipment. Tracks GPS location, movement, speed, engine state, device connectivity, and utilization metrics.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │────▶│   Backend   │────▶│ PostgreSQL  │
│  Next.js    │     │   FastAPI   │     │   (Docker)  │
│  Port 3000  │     │  Port 8000  │     │  Port 5433  │
└─────────────┘     └─────────────┘     └─────────────┘
                          ▲
                          │
                    ┌─────────────┐
                    │  Simulator  │
                    │ GPS Packets │
                    │  Every 5s   │
                    └─────────────┘
```

## Tech Stack

### Backend
- Python / FastAPI
- SQLAlchemy ORM
- PostgreSQL 16 (Docker)
- Pydantic validation

### Frontend
- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- React Leaflet (OpenStreetMap)
- Recharts
- Lucide React icons

### Simulator
- Python script sending GPS telemetry every 5 seconds

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- Docker (for PostgreSQL)
- Git

### 1. Database (PostgreSQL in Docker)

```bash
docker run -d \
  --name fleet_postgres \
  -e POSTGRES_DB=fleet_tracking \
  -e POSTGRES_USER=fleet_user \
  -e POSTGRES_PASSWORD=fleet_password \
  -p 5433:5432 \
  postgres:16
```

### 2. Backend

```bash
cd backend
python -m venv venv
.\venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

pip install fastapi uvicorn sqlalchemy psycopg2-binary pydantic

# Seed the database
python seed.py

# Run the API
uvicorn app.main:app --host 0.0.0.0 --port 8000
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
cd simulator
pip install requests
python gps_simulator.py
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| GET | `/db-test` | Database connectivity test |
| GET | `/equipment` | List all equipment (current state) |
| GET | `/equipment/{id}` | Get single equipment |
| POST | `/telemetry` | Ingest GPS telemetry packet |
| GET | `/equipment/{id}/telemetry` | Telemetry history for equipment |
| GET | `/equipment/{id}/utilization` | Utilization metrics |
| GET | `/devices` | List all GPS devices |
| GET | `/devices/{id}` | Get single device |

## Data Model

- **Equipment** — Physical machine (tractor, crane, excavator, dumper). Stores current state.
- **Device** — GPS/IoT tracker installed on equipment. Stores connectivity state.
- **Telemetry** — Historical GPS data packets (one row per 5-second reading).

## Equipment States

| Status | Meaning |
|--------|---------|
| Working | Engine ON, speed > 1 km/h |
| Idle | Engine ON, speed < 1 km/h |
| Stopped | Engine OFF |

Device connectivity (connected/disconnected) is independent of equipment status.

## Frontend Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard with KPIs + live map |
| `/equipment` | Equipment list with search & filters |
| `/equipment/[id]` | Equipment detail (Phase 4) |
| `/tracking` | Full-page live tracking map |
| `/telemetry` | Telemetry history (Phase 4) |
| `/analytics` | Utilization charts (Phase 5) |
| `/devices` | GPS device connectivity table |

## Environment Variables

Create `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Project Structure

```
equipment-tracking-poc/
├── backend/
│   ├── seed.py
│   └── venv/app/
│       ├── main.py          # FastAPI routes
│       ├── database.py      # DB connection
│       ├── db_models.py     # SQLAlchemy models
│       ├── models.py        # Pydantic Equipment model
│       ├── schemas.py       # Pydantic Telemetry schema
│       ├── device_models.py # Pydantic Device model
│       ├── dependencies.py  # DB session dependency
│       └── services/
│           └── utilization.py
├── frontend/
│   ├── app/                 # Next.js pages
│   ├── components/          # Reusable UI components
│   ├── lib/                 # API client, types, hooks
│   └── .env.local
└── simulator/
    └── gps_simulator.py
```

## License

Private — POC for internal use.
