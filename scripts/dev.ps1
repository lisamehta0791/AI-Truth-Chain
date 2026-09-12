<#
.SYNOPSIS
  Starts the whole Chain of Truth stack from THIS checkout, in one command.

.DESCRIPTION
  1. Starts Postgres + MinIO with Docker Compose and waits for Postgres.
  2. Applies database migrations.
  3. Seeds the demo officers and case if they are missing (-Scenario also loads
     every stage of the Riverside scenario through the AI pipeline, ~8 min).
  4. Stops anything stale that is still listening on ports 8000 / 5173, so the
     backend and frontend you get are the code on disk right now.
  5. Opens two PowerShell windows: the backend (uvicorn --reload, port 8000)
     and the frontend (Vite, port 5173).

.EXAMPLE
  .\scripts\dev.ps1
  .\scripts\dev.ps1 -Scenario      # also load the full demo scenario
  .\scripts\dev.ps1 -NoDocker      # Postgres/MinIO already running elsewhere
#>
param(
  [switch]$Scenario,
  [switch]$NoDocker
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$python = Join-Path $backend ".venv\Scripts\python.exe"

function Write-Step([string]$msg) { Write-Host ""; Write-Host ("== " + $msg) -ForegroundColor Magenta }

if (-not (Test-Path $python)) {
  Write-Host "Backend virtualenv not found at $python" -ForegroundColor Red
  Write-Host "Create it first:  cd backend; python -m venv .venv; .venv\Scripts\pip install -e ." -ForegroundColor Yellow
  exit 1
}
if (-not (Test-Path (Join-Path $root ".env"))) {
  Write-Host ".env is missing at the project root - copy .env.example to .env and fill in the secrets." -ForegroundColor Red
  exit 1
}
if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
  Write-Step "Installing frontend dependencies"
  Push-Location $frontend; npm install; Pop-Location
}

# ---------------------------------------------------------------- docker
if (-not $NoDocker) {
  Write-Step "Starting Postgres + MinIO (docker compose)"
  docker info *> $null
  if (-not $?) { Write-Host "Docker Desktop is not running. Start it, then re-run this script." -ForegroundColor Red; exit 1 }
  Push-Location $root
  docker compose up -d db minio
  Pop-Location

  Write-Host "Waiting for Postgres on port 5433..." -NoNewline
  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    docker exec cot_db pg_isready -U chain_of_truth *> $null
    if ($?) { $ready = $true; break }
    Start-Sleep -Seconds 2
    Write-Host "." -NoNewline
  }
  Write-Host ""
  if (-not $ready) { Write-Host "Postgres did not become ready. Check 'docker compose logs db'." -ForegroundColor Red; exit 1 }
}

# ---------------------------------------------------------------- migrate + seed
Write-Step "Applying migrations"
Push-Location $backend
& $python -m alembic upgrade head
if (-not $?) { Pop-Location; Write-Host "Migration failed." -ForegroundColor Red; exit 1 }
Pop-Location

Write-Step "Seeding demo officers and case (idempotent)"
Push-Location $root
if ($Scenario) { & $python (Join-Path $root "scripts\seed_demo_case.py") --scenario }
else { & $python (Join-Path $root "scripts\seed_demo_case.py") }
Pop-Location

# ---------------------------------------------------------------- stale listeners
Write-Step "Stopping anything stale on ports 8000 and 5173"
foreach ($port in 8000, 5173) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    $procId = $c.OwningProcess
    if ($procId -and $procId -ne 0) {
      $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
      if ($proc) {
        Write-Host ("  port {0}: stopping {1} (pid {2}) - it was serving old code" -f $port, $proc.ProcessName, $procId) -ForegroundColor Yellow
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      }
    }
  }
}
Start-Sleep -Seconds 1

# ---------------------------------------------------------------- start
Write-Step "Starting the backend (http://localhost:8000) and the frontend (http://localhost:5173)"
$backendCmd = "Set-Location '$backend'; Write-Host 'Chain of Truth backend - uvicorn --reload on :8000' -ForegroundColor Magenta; & '$python' -m uvicorn app.main:app --reload --port 8000"
$frontendCmd = "Set-Location '$frontend'; Write-Host 'Chain of Truth frontend - Vite on :5173' -ForegroundColor Magenta; npm run dev -- --port 5173 --strictPort"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

Write-Host ""
Write-Host "Open  http://localhost:5173" -ForegroundColor Green
Write-Host "API   http://localhost:8000/docs" -ForegroundColor Green
Write-Host ""
Write-Host "Demo sign-ins (password DemoPass!2026):" -ForegroundColor Cyan
Write-Host "  rajesh.menon@demo.chainoftruth.example   Commissioner - sees everything, drives the demo"
Write-Host "  vikram.nair@demo.chainoftruth.example    Superintendent"
Write-Host "  lisa.mathew@demo.chainoftruth.example    Inspector (officer of record)"
Write-Host "  meera.iyer@demo.chainoftruth.example     DSP, forensic reviewer"
Write-Host "  arjun.pillai@demo.chainoftruth.example   Constable (live capture required)"
Write-Host ""
if (-not $Scenario) { Write-Host "Tip: use the 'Load full demo' button on any page (as a DSP+ officer), or re-run with -Scenario." -ForegroundColor DarkGray }
