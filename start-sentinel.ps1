$ErrorActionPreference = "Stop"

Write-Host "Starting Sentinel SOC (Docker backend + dashboard)..." -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker CLI not found. Install Docker Desktop first: https://www.docker.com/products/docker-desktop/"
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Start Docker Desktop, wait until the Engine is running, then run this script again."
}

docker compose up --build -d
if ($LASTEXITCODE -ne 0) {
    throw "Sentinel containers failed to start. Check with: docker compose logs --tail=200"
}

Write-Host "Waiting for the API..." -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/docs" -TimeoutSec 2 -UseBasicParsing
        if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch { Start-Sleep -Seconds 2 }
}

if (-not $ready) {
    Write-Warning "Containers started, but the API did not become ready. Check: docker compose logs --tail=200 c2_core"
    exit 1
}

Write-Host "Waiting for the dashboard..." -ForegroundColor Yellow
$dashboardReady = $false
for ($i = 0; $i -lt 45; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8080" -TimeoutSec 2 -UseBasicParsing
        if ($response.StatusCode -eq 200) { $dashboardReady = $true; break }
    } catch { Start-Sleep -Seconds 2 }
}

if (-not $dashboardReady) {
    Write-Warning "The API is ready, but the dashboard is not responding yet. Check: docker compose logs --tail=200 dashboard"
    exit 1
}

Start-Process "http://localhost:8080"
Write-Host "Dashboard: http://localhost:8080" -ForegroundColor Green
Write-Host "API docs: http://localhost:8000/docs" -ForegroundColor Green
