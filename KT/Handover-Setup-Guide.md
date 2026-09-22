# Handover — Setup Guide (Clean Machine to Running App)

This guide takes a brand-new machine to a fully running FleetTrack stack.
Commands are PowerShell (Windows). Adapt paths for Linux/Mac.

Repository: https://github.com/sagarchavan-teleglobal/FleetTrack.git

---

## 1. Install Prerequisites

| Tool | Install | Verify |
|------|---------|--------|
| Git | https://git-scm.com | `git --version` |
| Python 3.11+ | https://python.org | `python --version` |
| Node.js 18+ | https://nodejs.org | `node --version` |
| Docker Desktop | https://docker.com/products/docker-desktop | `docker --version` |
| Ollama (optional) | https://ollama.com | `ollama --version` |
| ngrok (public demo only) | https://ngrok.com/download | `ngrok version` |

---

## 2. Clone the Repository

```powershell
git clone https://github.com/sagarchavan-teleglobal/FleetTrack.git
cd FleetTrack\equipment-tracking-poc
```

> The project root referenced throughout is
> `.../FleetTrack/equipment-tracking-poc`.

---

## 3. Database — PostgreSQL in Docker

Create the container (first time only):
```powershell
docker run -d `
  --name fleet_postgres `
  -e POSTGRES_DB=fleet_tracking `
  -e POSTGRES_USER=fleet_user `
  -e POSTGRES_PASSWORD=fleet_password `
  -p 5433:5432 `
  postgres:16
```
Subsequently:
```powershell
docker start fleet_postgres
```

The backend connection string (in `backend/venv/app/database.py`) expects
exactly these values:
```
postgresql+psycopg2://fleet_user:fleet_password@localhost:5433/fleet_tracking
```

---

## 4. Backend — Python Environment

The application code and the Python virtual environment both live under
`backend/venv/`. The interpreter is `backend/venv/Scripts/python.exe` and the
app package is `backend/venv/app/`.

If the venv already has packages (as shipped), skip to step 5. To (re)install:
```powershell
cd backend\venv
.\Scripts\python.exe -m pip install `
  fastapi uvicorn sqlalchemy psycopg2-binary pydantic requests razorpay groq httpx pytest paho-mqtt
```

---

## 5. Secrets & Configuration

### Backend secrets (`secrets.local.ps1` at project root — git-ignored)
Copy the template and fill in values:
```powershell
Copy-Item secrets.example.ps1 secrets.local.ps1
notepad secrets.local.ps1
```
Contents (all optional; app degrades gracefully if omitted):
```powershell
$env:GROQ_API_KEY          = "gsk_xxxxxxxxxxxxxxxxxxxx"   # fast cloud chat
$env:RAZORPAY_KEY_ID       = "rzp_test_xxxxxxxxxxxxx"     # payments (test)
$env:RAZORPAY_KEY_SECRET   = "xxxxxxxxxxxxxxxxxxxxxx"
$env:VOICE_CALL_SERVICE_URL = "http://3.92.238.46:8002/call/initiate"
```

### Frontend config (`frontend/.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_MAPTILER_KEY=<your maptiler key>
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
```
> On Vercel, set `NEXT_PUBLIC_API_URL` to the public ngrok URL of the backend.

### ngrok auth (public demo only)
```powershell
ngrok config add-authtoken <your-ngrok-token>
```

---

## 6. Seed Demo Data

```powershell
cd backend
.\venv\Scripts\python.exe seed.py
```
Creates vendors, cranes + a tractor, GPS devices, and a sample booking.

---

## 7. Frontend — Install Dependencies

```powershell
cd frontend
npm install --legacy-peer-deps
```

---

## 8. Ollama Model (optional — local LLM fallback)

```powershell
ollama serve
ollama pull qwen2.5:3b
```
Skip if you're using Groq exclusively.

---

## 9. Start Everything

### Option A — one command (recommended)
From the project root:
```powershell
.\start-all.ps1
```
This starts Docker/Postgres, Ollama, the backend (with secrets), the GPS
simulator, ngrok, and the frontend, in the right order. It's idempotent.

Flags:
- `.\start-all.ps1 -SkipFrontend` — API only
- `.\start-all.ps1 -SkipNgrok` — local only, no public tunnel

### Option B — manual (each in its own terminal)
```powershell
# 1. DB
docker start fleet_postgres

# 2. Ollama (optional)
ollama serve

# 3. Backend (load secrets first)
cd backend\venv
. ..\..\secrets.local.ps1
.\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 4. GPS simulator
cd backend
.\venv\Scripts\python.exe gps_simulator.py --interval 3

# 5. Frontend
cd frontend
npm run dev

# 6. ngrok (public only)
ngrok http 8000
```

---

## 10. Verify the Installation

```powershell
curl http://localhost:8000/               # API up
curl http://localhost:8000/db-test        # DB connected
curl http://localhost:8000/ai/status      # LLM provider
curl http://localhost:8000/dashboard/summary
```
Open the UI: **http://localhost:3000**
API docs: **http://localhost:8000/docs**

Run the tests:
```powershell
cd backend
.\venv\Scripts\python.exe -m pytest tests/test_api.py -v
```

---

## 11. Stopping Everything

```powershell
# Stop app processes
Get-Process python,node,ngrok -ErrorAction SilentlyContinue | Stop-Process -Force
# Stop the database
docker stop fleet_postgres
```

---

## 12. Common First-Run Problems

| Symptom | Fix |
|---------|-----|
| `connection refused` on 5433 | `docker start fleet_postgres` |
| No vendors/cranes in UI | run `python seed.py` |
| Chat slow / says provider "ollama" | set `GROQ_API_KEY` before starting backend |
| Frontend blank for ~15s | Next.js first compile; wait |
| `Address already in use` :8000 | kill old python/uvicorn processes |
| Voice call "busy" | external voice service is down (their side) |

See `KT-Session-3-Demo-Troubleshooting-QA.md` for detailed troubleshooting.
