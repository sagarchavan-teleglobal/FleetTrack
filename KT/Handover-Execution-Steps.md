# Handover — Execution Steps (Build, Run, Test, Stop)

Quick, copy-paste command reference. All commands are PowerShell, run from the
project root `.../FleetTrack/equipment-tracking-poc` unless stated otherwise.

---

## 0. One-Command Start (the usual way)

```powershell
.\start-all.ps1
```
Brings up Docker/Postgres → Ollama → backend (with secrets) → GPS simulator →
ngrok → frontend, in order. Idempotent (skips what's already running).

Flags:
```powershell
.\start-all.ps1 -SkipFrontend    # API/backend only
.\start-all.ps1 -SkipNgrok       # local only, no public tunnel
```

Then open **http://localhost:3000** (local) or the Vercel URL for the public
demo.

---

## 1. Start Services Individually

### 1.1 Database
```powershell
docker start fleet_postgres
# first-time creation:
docker run -d --name fleet_postgres `
  -e POSTGRES_DB=fleet_tracking -e POSTGRES_USER=fleet_user `
  -e POSTGRES_PASSWORD=fleet_password -p 5433:5432 postgres:16
```

### 1.2 Ollama (optional local LLM)
```powershell
ollama serve
ollama pull qwen2.5:3b       # first time only
```

### 1.3 Backend
```powershell
# load secrets into the current shell
. .\secrets.local.ps1
cd backend\venv
.\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level warning
```

### 1.4 Seed data (first run / reset)
```powershell
cd backend
.\venv\Scripts\python.exe seed.py
```

### 1.5 GPS simulator
```powershell
cd backend
.\venv\Scripts\python.exe gps_simulator.py --interval 3
```

### 1.6 ngrok (public demo)
```powershell
ngrok http 8000
# get the public URL:
curl http://127.0.0.1:4040/api/tunnels
```

### 1.7 Frontend
```powershell
cd frontend
npm install --legacy-peer-deps   # first time only
npm run dev
```

---

## 2. Verify

```powershell
curl http://localhost:8000/                 # {"message":"...running"}
curl http://localhost:8000/db-test          # {"status":"connected"}
curl http://localhost:8000/ai/status        # {"provider":"groq"|"ollama",...}
curl http://localhost:8000/dashboard/summary
```
UI: http://localhost:3000  •  API docs: http://localhost:8000/docs

Confirm GPS is flowing (positions should change over a few seconds):
```powershell
curl http://localhost:8000/equipment
```

---

## 3. Run Tests

```powershell
cd backend
.\venv\Scripts\python.exe -m pytest tests/test_api.py -v
```
Backend + PostgreSQL must be running (integration tests hit the live server).

---

## 4. Build the Frontend (production)

```powershell
cd frontend
npm run build
npm run start      # serves the production build locally
```
For the hosted demo, Vercel builds automatically on push to the connected repo.

---

## 5. Stop Everything

```powershell
# stop app processes
Get-Process python,node,ngrok -ErrorAction SilentlyContinue | Stop-Process -Force
# stop the database container
docker stop fleet_postgres
```

Stop a single service:
```powershell
# backend only (find and kill the uvicorn python process)
Get-Process python -ErrorAction SilentlyContinue | Where-Object {
  (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -like "*uvicorn*"
} | Stop-Process -Force
```

---

## 6. Restart Cleanly (recover from stuck state)

```powershell
# 1. kill app processes
Get-Process python,node,ngrok -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 4
# 2. confirm port 8000 is free
netstat -ano | Select-String ":8000 " | Select-String "LISTENING"
# 3. start again
.\start-all.ps1
```
If port 8000 remains stuck (rare Windows leaked-socket case), restart the
machine, then `.\start-all.ps1`.

---

## 7. Git — Common Operations

```powershell
# using the bundled git if `git` isn't on PATH:
$git = "C:\Users\<you>\AppData\Local\Programs\Git\bin\git.exe"

& $git status
& $git add <files>
& $git commit -m "message"
& $git push
```
> `secrets.local.ps1` is git-ignored and must never be committed.

---

## 8. Deploy Frontend Changes (Vercel)

1. Commit and push to the connected GitHub repo — Vercel auto-builds.
2. If the backend's ngrok URL changed: update `NEXT_PUBLIC_API_URL` in the
   Vercel project's Environment Variables, then redeploy.

---

## 9. Quick Reference — Ports

| Service | Port |
|---------|------|
| Backend (FastAPI) | 8000 |
| Frontend (Next.js) | 3000 |
| PostgreSQL (host) | 5433 |
| Ollama | 11434 |
| ngrok inspector | 4040 |
