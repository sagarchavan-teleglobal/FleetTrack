# FleetTrack – Knowledge Transfer (KT) Package

This folder contains the complete Knowledge Transfer documentation for the
**FleetTrack – IoT Equipment Tracking & Crane Booking** project.

FleetTrack is a full-stack proof-of-concept that demonstrates:
- Real-time GPS/IoT telemetry tracking of heavy equipment (cranes, tractors, etc.)
- A crane rental **booking system** with live payment integration (Razorpay)
- **Utilization analytics** and reporting (charts + PDF export)
- An **AI chat agent** and **AI voice agent** for vendor communication
- Rule-based **alerting** and **geofencing**

---

## KT Sessions

The KT is delivered across three sessions. Each session has a dedicated
document in this folder.

| # | Session | Document | Covers |
|---|---------|----------|--------|
| 1 | Architecture & Design | `KT-Session-1-Architecture.md` | Architecture, technology stack, system components, data flow |
| 2 | Build & Run | `KT-Session-2-Backend-Frontend-Setup.md` | Backend setup, DB setup, APIs, telemetry ingestion, GPS simulator, frontend walkthrough, execution steps |
| 3 | Operate & Handover | `KT-Session-3-Demo-Troubleshooting-QA.md` | End-to-end demo, troubleshooting, deployment/setup requirements, Q&A |

## Handover Documents

These are the formal handover artifacts, also in this folder.

| Document | Purpose |
|----------|---------|
| `Handover-Setup-Guide.md` | Step-by-step environment setup from a clean machine |
| `Handover-HLD.md` | High-Level Design (architecture, components, integrations) |
| `Handover-LLD-TDD.md` | Low-Level / Technical Design (modules, DB schema, algorithms, functions) |
| `Handover-API-Reference.md` | Complete API reference for every endpoint |
| `Handover-Execution-Steps.md` | Exact commands to build, run, test, and stop |
| `Handover-Source-Config-Details.md` | Source-tree map, config files, env vars, secrets, ports |

---

## File formats

Every document in this folder is provided in **two formats**:

- **`.docx`** (Microsoft Word) — for reading, printing, and sharing with
  stakeholders. These are the handover deliverables.
- **`.md`** (Markdown) — the source of truth, diff-friendly and versioned in git.

If you edit a `.md` file, regenerate the Word versions with:

```powershell
cd KT
..\backend\venv\Scripts\python.exe convert-to-docx.py
```

That script (`convert-to-docx.py`) converts every `.md` in this folder to a
matching `.docx`, preserving headings, tables, code blocks, and the ASCII
architecture diagrams. It needs `python-docx` (already installed in
`backend/venv`; otherwise `pip install python-docx`).

---

## Quick Facts

| Item | Value |
|------|-------|
| Repository | https://github.com/sagarchavan-teleglobal/FleetTrack.git |
| Backend | FastAPI (Python), runs on port **8000** |
| Frontend | Next.js 16 (TypeScript), runs on port **3000** |
| Database | PostgreSQL 16 in Docker, host port **5433** |
| Local LLM | Ollama (`qwen2.5:3b`) on port **11434** |
| Cloud LLM | Groq (`openai/gpt-oss-120b`) – default when key present |
| Public demo | https://fleet-track-black.vercel.app (frontend) via ngrok tunnel to local backend |
| One-command start | `./start-all.ps1` (from project root) |

---

## How to use this package

- **New joiner / handover recipient:** read in order — Session 1, then the HLD,
  then Session 2 + Setup Guide to get it running, then Session 3 for operations.
- **Just need to run it:** go straight to `Handover-Setup-Guide.md` and
  `Handover-Execution-Steps.md`.
- **Integrating / extending an API:** use `Handover-API-Reference.md` and
  `Handover-LLD-TDD.md`.

> Note on folder layout: the FastAPI application source lives under
> `backend/venv/app/`. This is unusual (application code inside a folder named
> `venv`) but is intentional for this POC and is tracked in git. See the
> Source & Config document for details.
