# KT Session 3 — End-to-End Demo, Troubleshooting, Deployment & Q&A

**Project:** FleetTrack – IoT Equipment Tracking & Crane Booking
**Goal of this session:** Run the full product as a scripted demo, know how to
fix the issues that actually come up, understand the deployment/hosting setup,
and cover the frequently asked questions.

> Assumes KT Sessions 1 and 2 are done and the stack runs locally.

---

## 1. End-to-End Demo Script

Run `.\start-all.ps1` first and confirm all services are green (Section 3 of
KT-2). Then walk the story in this order — it mirrors a real customer journey.

### Scene 1 — Live Fleet Tracking (the IoT core)
1. Open the **Dashboard** (`/`).
2. Point out the KPI cards (total equipment, working/idle/stopped counts,
   GPS connected).
3. Show the **live map** — markers are moving. Explain that the GPS simulator
   is POSTing telemetry every 3 seconds and updates arrive over a **WebSocket**
   (no page refresh).
4. Open **Live Tracking** (`/tracking`) for the full-screen map.
5. Open **Devices** (`/devices`) — show connectivity and signal strength.

**Talking point:** "This is the IoT layer. In production the simulator is
replaced by real GPS trackers publishing over MQTT; the backend contract is
identical."

### Scene 2 — Alerts & Monitoring
1. Open **Alerts** (`/alerts`).
2. Explain the rules: low GPS signal (<50%), overspeed (>15 km/h), device
   reconnect. These fire automatically as telemetry streams in.
3. Acknowledge an alert to show the workflow.

### Scene 3 — Crane Booking + Payment
1. Open **Bookings** (`/bookings`) — show KPI cards (total/available/repair
   cranes, active bookings) and the existing sample booking.
2. Click **New Booking** (`/bookings/new`):
   - Pick a date range → the app calls `/cranes/available` and shows only
     cranes free for those dates.
   - Select a crane, enter customer details.
   - Proceed to payment → **Razorpay Checkout** opens (test mode).
   - Use a Razorpay **test card** to pay. On success, the booking becomes
     `confirmed` and the crane's lifecycle flips `available → booked`.
3. Back on the dashboard, show the crane's status has changed and the pie chart
   updated.

**Talking point:** "The crane has two independent statuses — operational
(from GPS) and commercial (from bookings). Payment is real Razorpay in test
mode, verified by signature on the backend."

### Scene 4 — Utilization Reports
1. Open **Reports** (`/reports`).
2. Select a machine and a date range → charts render (working vs idle vs
   downtime, uptime %, utilization %).
3. Click **Export PDF** — a report downloads (html2canvas + jspdf).
4. Optionally show the fleet-wide report.

### Scene 5 — AI Chat Agent
1. Open **Chat** (`/chat`), pick a vendor.
2. Type "Give me a quick status update on your cranes."
3. The reply **streams in token-by-token** (SSE) in ~1–2 seconds (Groq).
4. Point out the reply references **real crane data** (IDs, rates, active
   bookings) — the prompt is built from the DB, not generic.
5. Show the **quick actions** (status / ETA / maintenance / payment reminder).

**Talking point:** "The chat is grounded in live fleet data. It uses Groq's
cloud LLM for speed, with a local Ollama model as an automatic fallback."

### Scene 6 — AI Voice Agent
1. In the Chat page, click **Call Vendor**.
2. If the external voice service is up, it places a **real outbound phone call**
   to the vendor's number and logs it (`voice_calls`), later attaching a
   transcript + summary.
3. If the service is down, the UI shows **"voice channel is busy"** with a
   retry — no fake call.

**Talking point:** "This is a real integration. There's deliberately no mock
fallback for voice, so what you see is genuine."

### Demo fallbacks (if something external is down)
- **Voice service down** → describe the flow, show the graceful busy message,
  and reference `docs/VOICE_AGENT_TRANSCRIPTS.md` for sample transcripts.
- **Groq rate-limited** → chat still works via Ollama (slower ~3–6s) or keyword
  fallback.
- **Razorpay hiccup** → unset the keys to run payments in demo mode.

---

## 2. Troubleshooting — Issues We Actually Hit

### 2.1 Backend won't start / `connection refused` on 5433
**Cause:** PostgreSQL container isn't running.
**Fix:**
```powershell
docker start fleet_postgres
docker ps --filter "name=fleet_postgres"   # confirm "Up"
```
If the container doesn't exist, create it (KT-2 Section 2).

### 2.2 `Address already in use` on port 8000
**Cause:** an old backend process (or a stuck/ghost process) still holds 8000.
**Fix:**
```powershell
# find the listener
netstat -ano | Select-String ":8000 " | Select-String "LISTENING"
# kill uvicorn python processes
Get-Process python -ErrorAction SilentlyContinue | Where-Object {
  (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -like "*uvicorn*"
} | Stop-Process -Force
```
> Known quirk on Windows: occasionally `netstat` shows a listener PID that
> `Get-Process` can't see (a leaked socket handle from a killed reload worker).
> If a fresh start fails to bind, the reliable fix is to kill all `python` /
> `node` / `ngrok` processes and re-run `start-all.ps1`. As a last resort,
> restart the machine.

### 2.3 Dashboard is empty / data doesn't load on the deployed (Vercel) site
**Cause A:** ngrok tunnel changed URL or is down, so the frontend can't reach
the backend.
**Fix:** get the current ngrok URL (`http://127.0.0.1:4040`), update
`NEXT_PUBLIC_API_URL` in Vercel, redeploy.
**Cause B:** ngrok's browser-warning interstitial. The API client already sends
the `ngrok-skip-browser-warning` header to avoid this; if you add new fetch
calls, include that header too.

### 2.4 ngrok "could not confirm tunnel URL" in the startup script
**Cause:** ngrok registers its local API (`:4040`) a couple of seconds after
launch — sometimes after the script's check window.
**Fix:** it's usually fine; verify with:
```powershell
curl http://127.0.0.1:4040/api/tunnels
```

### 2.5 Chat is slow (3–6s) or returns canned replies
**Cause:** running on the local Ollama model instead of Groq, or the LLM is
unreachable.
**Fix:** ensure `GROQ_API_KEY` is set before starting the backend, then confirm:
```powershell
curl http://localhost:8000/ai/status   # expect {"provider":"groq", ...}
```
If it says `ollama` you started the backend without the key.

> Also relevant: long chat threads increase prompt size and latency. The prompt
> only includes the **last 10 messages**, but heavy test data can still slow
> things — clearing `chat_messages` restores snappy responses.

### 2.6 Voice call returns 503 "voice channel busy"
**Cause:** the **external** voice service (`3.92.238.46:8002`) is down or
erroring (it has been intermittent). This is not a bug on our side.
**Check the external service directly:**
```powershell
$b = '{"phone_number":"+91...","vendor_name":"X","crane_name":"Y","crane_id":"Z","booking_status":"active","client_site":"S","end_date":"this week"}'
$b | Out-File "$env:TEMP\v.json" -Encoding utf8 -NoNewline
curl.exe -s -o NUL -w "%{http_code}" -X POST "http://3.92.238.46:8002/call/initiate" -H "Content-Type: application/json" --data-binary "@$env:TEMP\v.json"
# 200 = up, 500 = their service is down
```
Our backend behaves correctly either way (real call on success, 503 on failure).

### 2.7 Frontend shows 000 / not responding right after start
**Cause:** Next.js dev server takes 10–15s to compile on first load.
**Fix:** wait, then re-check `http://localhost:3000`.

### 2.8 Ollama not found / not responding
**Cause:** Ollama service not running or model not pulled.
**Fix:**
```powershell
ollama serve
ollama pull qwen2.5:3b
```
Not fatal if you're using Groq — Ollama is only the fallback.

### 2.9 Seed data missing (no vendors/cranes)
**Fix:**
```powershell
cd backend
.\venv\Scripts\python.exe seed.py
```

---

## 3. Deployment & Setup Requirements

### 3.1 Current hosting model
```
Browser ──▶ Vercel (Next.js frontend, public)
               │  NEXT_PUBLIC_API_URL
               ▼
          ngrok tunnel (public URL) ──▶ local backend :8000
                                            │
              ┌─────────────────────────────┼───────────────┐
              ▼                             ▼                ▼
        PostgreSQL (Docker :5433)     Ollama :11434     Groq / Razorpay / Voice
```
- **Frontend:** permanently hosted on **Vercel**.
- **Backend + DB + LLM:** run on a **local/dev machine**, exposed publicly via
  **ngrok**. This means the public demo only works while that machine is on and
  the stack is running.
- **Constraint (free ngrok):** if ngrok restarts and the URL changes, update
  `NEXT_PUBLIC_API_URL` in Vercel and redeploy.

### 3.2 Minimum machine requirements
| Resource | Minimum |
|----------|---------|
| OS | Windows (scripts are PowerShell); Linux/Mac possible with equivalent commands |
| RAM | 8 GB (16 GB if running the local Ollama model comfortably) |
| Disk | ~5 GB (Docker image, Node modules, Ollama model) |
| Network | Outbound HTTPS for Groq, Razorpay, ngrok, voice service |

### 3.3 External accounts / keys needed
| Service | What's needed | Where it goes |
|---------|---------------|---------------|
| Groq | API key (free tier) | `GROQ_API_KEY` in `secrets.local.ps1` |
| Razorpay | Test key id + secret | `RAZORPAY_KEY_ID/SECRET` in `secrets.local.ps1`, `NEXT_PUBLIC_RAZORPAY_KEY_ID` in frontend |
| MapTiler | Map tiles key | `NEXT_PUBLIC_MAPTILER_KEY` in `frontend/.env.local` |
| ngrok | Auth token | `ngrok config add-authtoken ...` |
| Voice service | Endpoint URL | `VOICE_CALL_SERVICE_URL` (code default already set) |

### 3.4 Recommended path to a "always-on" deployment (future)
The current ngrok model is fine for demos but not for permanent hosting. To make
it robust:
- Host the **backend** on a cloud VM/container (Railway, Render, Fly.io, or a
  small EC2) with a stable URL.
- Use a **managed PostgreSQL** (RDS, Neon, Supabase) instead of the Docker
  container.
- Keep the **frontend on Vercel**, pointing `NEXT_PUBLIC_API_URL` at the stable
  backend URL.
- For the LLM, either keep Groq (cloud, no infra) or run Ollama on the same VM
  (needs a GPU for good latency).
- Replace `migrations.py` with **Alembic**.
- Move secrets to the platform's secret manager (not a local file).

---

## 4. Security & Data Notes (for questions)

- **Secrets** are never committed — they live in `secrets.local.ps1`
  (git-ignored) and are injected as env vars. `secrets.example.ps1` is the
  committed template.
- **CORS** is currently open (`allow_origins=["*"]`) so the Vercel frontend can
  call the ngrok backend. Tighten this to specific origins for production.
- **Payments** use Razorpay **test mode**; no real money moves. The backend
  verifies the payment **signature** — the frontend never confirms a booking on
  its own.
- **Voice calls** place real phone calls when the external service is up — be
  mindful the vendor phone numbers in seed data are placeholders; a real number
  must be set on the vendor to actually ring.
- **The DB connection string is hardcoded** in `database.py` for the POC. For
  production, move it to an environment variable.

---

## 5. Known Limitations / Tech Debt

| Area | Limitation | Recommended fix |
|------|-----------|-----------------|
| Migrations | Hand-rolled `ensure_schema` DDL | Adopt Alembic |
| DB config | Connection string hardcoded | Env var / secret manager |
| CORS | Wide open (`*`) | Restrict to known origins |
| Hosting | Backend via ngrok on a dev machine | Cloud host + managed DB |
| MQTT | Broker + bridge built but dormant | Wire up when real hardware arrives |
| Folder layout | App code under `backend/venv/app` | Move to a clean `backend/app` package |
| Voice fallback | None by design | Add retry/queue if the service is flaky |
| Auth | No authentication/authorization | Add auth before any real deployment |

---

## 6. Frequently Asked Questions

**Q: Why is the application code inside a folder called `venv`?**
It's a POC artifact — the app package ended up at `backend/venv/app`. It's real,
tracked source. The Python interpreter is `backend/venv/Scripts/python.exe`.
Recommended cleanup: relocate to `backend/app`.

**Q: How does real-time work — polling or push?**
Push. The map subscribes to the `/ws/telemetry` WebSocket; the backend
broadcasts each telemetry update. Chat streaming uses SSE. Some list views also
poll on an interval as a safety net.

**Q: What decides if a crane shows working/idle/stopped?**
The `/telemetry` handler: engine off → stopped; engine on & speed < 1 → idle;
engine on & speed ≥ 1 → working. That's the *operational* status. The
*commercial* lifecycle (available/booked/working/repair/deceased) is separate
and driven by bookings and manual actions.

**Q: Which LLM is used and can we change it?**
Default is **Groq** with `openai/gpt-oss-120b` (fast, cloud). Set `GROQ_MODEL` to
change it. Without `GROQ_API_KEY`, it falls back to local **Ollama**
(`qwen2.5:3b`, set via `OLLAMA_MODEL`). If both are unavailable, chat uses static
keyword replies.

**Q: Is the payment real?**
It's real Razorpay in **test mode** — real API calls, real signature
verification, no real money. Without keys it runs a demo simulation.

**Q: Is the voice call real?**
Yes, when the external service is reachable it dials a real phone. There's no
mock fallback for voice by design.

**Q: How do I run everything with one command?**
`.\start-all.ps1` from the project root. It's idempotent and loads secrets from
`secrets.local.ps1`.

**Q: How do I add real GPS hardware later?**
Devices publish to the Mosquitto MQTT broker; `mqtt/bridge.py` subscribes to
`fleet/telemetry/#` and forwards each message to the same `/telemetry` endpoint
the simulator uses. No backend change needed.

**Q: Where are the tests?**
`backend/tests/test_api.py` — 50 integration tests against a running backend.
Run with `pytest tests/test_api.py -v`.

**Q: Where is the API documented interactively?**
FastAPI auto-generates Swagger UI at `http://localhost:8000/docs` and ReDoc at
`http://localhost:8000/redoc`.

---

## 7. Session 3 Recap

- Six-scene demo: tracking → alerts → booking+payment → reports → chat → voice.
- Most "issues" are environmental: Postgres not up, port 8000 held, ngrok URL
  changed, backend started without the Groq key, or the external voice service
  being down.
- Current hosting = Vercel frontend + ngrok-exposed local backend; documented
  path to a stable cloud deployment.
- Known tech debt is catalogued (migrations, CORS, hardcoded DB URL, folder
  layout, auth).

> See the **Handover documents** in this folder for the formal Setup Guide,
> HLD, LLD/TDD, API reference, execution steps, and source/config details.
