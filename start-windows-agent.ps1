$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    throw "Python 3 is required. Install it from https://www.python.org/downloads/windows/ and enable the Python launcher."
}

$venvPython = Join-Path $repoRoot ".venv-windows-agent\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    py -3 -m venv .venv-windows-agent
    if ($LASTEXITCODE -ne 0) { throw "Could not create the Windows agent virtual environment." }
}

& $venvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw "Could not upgrade pip." }
& $venvPython -m pip install psutil websockets
if ($LASTEXITCODE -ne 0) { throw "Could not install the Windows agent dependencies." }

Write-Host "Connecting this Windows host to Sentinel SOC at localhost:8765..." -ForegroundColor Cyan
& $venvPython c2_core\agent\sentinel_agent.py --server localhost
