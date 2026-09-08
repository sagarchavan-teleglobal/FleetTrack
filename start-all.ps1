<#
.SYNOPSIS
    Starts the full FleetTrack stack: Docker/Postgres, Ollama, backend API,
    GPS simulator, ngrok tunnel, and the frontend dev server.

.DESCRIPTION
    Run this once per session (e.g. after a machine restart) to bring
    everything back up in the correct order. Safe to re-run - it checks
    what's already up and skips/reuses it instead of double-starting.

    Secrets (Groq, Razorpay, voice service URL) are loaded from
    "secrets.local.ps1" in the same folder if present. That file is
    git-ignored - see secrets.example.ps1 for the template.

.USAGE
    Right-click > "Run with PowerShell", or from a terminal:
        cd equipment-tracking-poc
        .\start-all.ps1

    Optional flags:
        .\start-all.ps1 -SkipFrontend   # backend/API only, skip npm dev server
        .\start-all.ps1 -SkipNgrok      # local-only, no public tunnel
#>

param(
    [switch]$SkipFrontend,
    [switch]$SkipNgrok
)

$ErrorActionPreference = "Continue"
$root = $PSScriptRoot

function Write-Step($msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Write-Ok($msg) {
    Write-Host "    [OK] $msg" -ForegroundColor Green
}

function Write-Warn($msg) {
    Write-Host "    [!!] $msg" -ForegroundColor Yellow
}

function Test-Http($url, $timeoutSec = 5) {
    try {
        $code = curl.exe -s -m $timeoutSec -o NUL -w "%{http_code}" $url 2>$null
        return $code -eq "200"
    } catch {
        return $false
    }
}

# --------------------------------------------------
# 0. Load secrets (Groq / Razorpay / voice service)
# --------------------------------------------------

Write-Step "Loading configuration"

$secretsFile = Join-Path $root "secrets.local.ps1"
if (Test-Path $secretsFile) {
    . $secretsFile
    Write-Ok "Loaded secrets.local.ps1"
} else {
    Write-Warn "secrets.local.ps1 not found - copy secrets.example.ps1 to secrets.local.ps1 and fill in your keys."
    Write-Warn "Continuing without them: chat will use local Ollama, payments will run in demo mode, voice calling will be disabled."
}

# --------------------------------------------------
# 1. Docker Desktop + PostgreSQL
# --------------------------------------------------

Write-Step "Docker Desktop / PostgreSQL"

$dockerUp = $false
try {
    docker ps > $null 2>&1
    if ($LASTEXITCODE -eq 0) { $dockerUp = $true }
} catch {}

if (-not $dockerUp) {
    Write-Host "    Starting Docker Desktop (this can take 30-60s)..."
    $dockerExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerExe) {
        Start-Process $dockerExe
    } else {
        Write-Warn "Docker Desktop.exe not found at the default path. Start it manually, then re-run this script."
    }

    $waited = 0
    while ($waited -lt 90) {
        Start-Sleep -Seconds 3
        $waited += 3
        docker ps > $null 2>&1
        if ($LASTEXITCODE -eq 0) { $dockerUp = $true; break }
    }
}

if ($dockerUp) {
    Write-Ok "Docker daemon is responding"

    $pgStatus = docker ps -a --filter "name=fleet_postgres" --format "{{.Status}}" 2>$null
    if ($pgStatus -like "Up*") {
        Write-Ok "fleet_postgres already running"
    } elseif ($pgStatus) {
        docker start fleet_postgres > $null 2>&1
        Start-Sleep -Seconds 3
        Write-Ok "fleet_postgres container started"
    } else {
        Write-Warn "No fleet_postgres container found. Create it once with:"
        Write-Host "      docker run -d --name fleet_postgres -e POSTGRES_DB=fleet_tracking -e POSTGRES_USER=fleet_user -e POSTGRES_PASSWORD=fleet_password -p 5433:5432 postgres:16"
    }
} else {
    Write-Warn "Docker did not come up in time. PostgreSQL-dependent features (almost everything) will fail until it's running."
}

# --------------------------------------------------
# 2. Ollama (local LLM fallback)
# --------------------------------------------------

Write-Step "Ollama (local LLM fallback)"

if (Test-Http "http://localhost:11434/api/tags") {
    Write-Ok "Ollama already running"
} else {
    $ollamaExe = Get-Command ollama -ErrorAction SilentlyContinue
    if ($ollamaExe) {
        Start-Process -WindowStyle Hidden ollama -ArgumentList "serve"
        Start-Sleep -Seconds 5
        if (Test-Http "http://localhost:11434/api/tags" 8) {
            Write-Ok "Ollama started"
        } else {
            Write-Warn "Ollama did not respond after starting. Chat will rely on Groq only (fine if GROQ_API_KEY is set)."
        }
    } else {
        Write-Warn "ollama command not found. Skipping - chat will rely on Groq only if GROQ_API_KEY is set."
    }
}

# --------------------------------------------------
# 3. Backend (FastAPI / uvicorn)
# --------------------------------------------------

Write-Step "Backend API (port 8000)"

if (Test-Http "http://localhost:8000/") {
    Write-Ok "Backend already running on port 8000"
} else {
    $backendDir = Join-Path $root "backend\venv"
    $pythonExe = Join-Path $backendDir "Scripts\python.exe"

    if (-not (Test-Path $pythonExe)) {
        Write-Warn "Python venv not found at $pythonExe - create it first (see README.md)."
    } else {
        # Build the command with whichever env vars were loaded from secrets.
        $envLines = @()
        if ($env:GROQ_API_KEY)          { $envLines += "`$env:GROQ_API_KEY = '$($env:GROQ_API_KEY)'" }
        if ($env:GROQ_MODEL)            { $envLines += "`$env:GROQ_MODEL = '$($env:GROQ_MODEL)'" }
        if ($env:RAZORPAY_KEY_ID)       { $envLines += "`$env:RAZORPAY_KEY_ID = '$($env:RAZORPAY_KEY_ID)'" }
        if ($env:RAZORPAY_KEY_SECRET)   { $envLines += "`$env:RAZORPAY_KEY_SECRET = '$($env:RAZORPAY_KEY_SECRET)'" }
        if ($env:VOICE_CALL_SERVICE_URL) { $envLines += "`$env:VOICE_CALL_SERVICE_URL = '$($env:VOICE_CALL_SERVICE_URL)'" }

        $envBlock = $envLines -join "; "
        $cmd = "$envBlock; & '$pythonExe' -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level warning"

        Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd -WorkingDirectory $backendDir -WindowStyle Minimized

        Write-Host "    Waiting for backend to come up..."
        $waited = 0
        $up = $false
        while ($waited -lt 30) {
            Start-Sleep -Seconds 3
            $waited += 3
            if (Test-Http "http://localhost:8000/" 5) { $up = $true; break }
        }

        if ($up) {
            Write-Ok "Backend started"
            try {
                $ai = curl.exe -s -m 8 "http://localhost:8000/ai/status" | ConvertFrom-Json
                Write-Ok "AI provider: $($ai.provider) / $($ai.model)"
            } catch {}
        } else {
            Write-Warn "Backend did not respond within 30s. Check the opened terminal window for errors."
        }
    }
}

# --------------------------------------------------
# 4. GPS Simulator
# --------------------------------------------------

Write-Step "GPS Simulator"

$simRunning = Get-Process python -ErrorAction SilentlyContinue |
    Where-Object {
        try { (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -like "*gps_simulator*" }
        catch { $false }
    }

if ($simRunning) {
    Write-Ok "GPS simulator already running"
} else {
    $backendDir = Join-Path $root "backend"
    $pythonExe = Join-Path $root "backend\venv\Scripts\python.exe"
    $simScript = Join-Path $backendDir "gps_simulator.py"

    if ((Test-Path $pythonExe) -and (Test-Path $simScript)) {
        $simCmd = "& '$pythonExe' gps_simulator.py --interval 3"
        Start-Process powershell -ArgumentList "-NoExit", "-Command", $simCmd -WorkingDirectory $backendDir -WindowStyle Minimized
        Write-Ok "GPS simulator started"
    } else {
        Write-Warn "gps_simulator.py or python venv not found - skipped."
    }
}

# --------------------------------------------------
# 5. ngrok (public tunnel)
# --------------------------------------------------

if (-not $SkipNgrok) {
    Write-Step "ngrok tunnel"

    $tunnelUrl = $null
    try {
        $tunnels = (Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 3).tunnels
        if ($tunnels) { $tunnelUrl = $tunnels[0].public_url }
    } catch {}

    if ($tunnelUrl) {
        Write-Ok "ngrok already running: $tunnelUrl"
    } else {
        $ngrokExe = Get-Command ngrok -ErrorAction SilentlyContinue
        if ($ngrokExe) {
            Start-Process powershell -ArgumentList "-NoExit", "-Command", "ngrok http 8000 --log=stdout" -WorkingDirectory $root -WindowStyle Minimized
            Start-Sleep -Seconds 6
            try {
                $tunnels = (Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 5).tunnels
                if ($tunnels) {
                    $tunnelUrl = $tunnels[0].public_url
                    Write-Ok "ngrok started: $tunnelUrl"
                    Write-Warn "If this URL differs from before, update NEXT_PUBLIC_API_URL in Vercel and redeploy."
                } else {
                    Write-Warn "ngrok started but no tunnel URL reported yet. Check http://127.0.0.1:4040"
                }
            } catch {
                Write-Warn "Could not confirm ngrok tunnel URL. Check http://127.0.0.1:4040"
            }
        } else {
            Write-Warn "ngrok command not found. Skipping public tunnel."
        }
    }
} else {
    Write-Step "ngrok tunnel"
    Write-Ok "Skipped (-SkipNgrok)"
}

# --------------------------------------------------
# 6. Frontend (Next.js dev server)
# --------------------------------------------------

if (-not $SkipFrontend) {
    Write-Step "Frontend (port 3000)"

    if (Test-Http "http://localhost:3000/" 5) {
        Write-Ok "Frontend already running on port 3000"
    } else {
        $frontendDir = Join-Path $root "frontend"
        if (Test-Path $frontendDir) {
            Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev" -WorkingDirectory $frontendDir -WindowStyle Minimized
            Write-Ok "Frontend dev server starting (may take 5-10s)"
        } else {
            Write-Warn "frontend/ folder not found - skipped."
        }
    }
} else {
    Write-Step "Frontend"
    Write-Ok "Skipped (-SkipFrontend)"
}

# --------------------------------------------------
# Summary
# --------------------------------------------------

Write-Step "Done"
Write-Host ""
Write-Host "  Local backend:   http://localhost:8000" -ForegroundColor White
Write-Host "  Local frontend:  http://localhost:3000" -ForegroundColor White
Write-Host "  Vercel (public): https://fleet-track-black.vercel.app" -ForegroundColor White
Write-Host ""
Write-Host "  Give it 10-15 seconds for everything to finish warming up, then verify with:" -ForegroundColor DarkGray
Write-Host "      curl http://localhost:8000/ai/status" -ForegroundColor DarkGray
Write-Host ""
