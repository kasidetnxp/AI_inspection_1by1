# ==============================================================================
# Edge AI Semiconductor Wafer Defect Inspection System - One-Click Launcher (Windows)
# (Dual-Node: i.MX8 Edge Backend + NestJS PC Central Backend + React 19 HMI)
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ProjectDir = $PSScriptRoot
Set-Location -Path $ProjectDir

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Starting Edge AI Wafer Inspection System (Windows Multi-Node)..." -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Helper function to check if a port is in LISTEN state
function Test-PortListening {
    param([int]$Port)
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ($conn) { return $true }
    } catch {}

    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect("127.0.0.1", $Port, $null, $null)
        $wait = $iar.AsyncWaitHandle.WaitOne(400, $false)
        if ($wait) {
            $tcp.EndConnect($iar)
            $tcp.Close()
            return $true
        }
        $tcp.Close()
    } catch {}
    return $false
}

function Start-DetachedCmd {
    param(
        [string]$Command,
        [string]$WorkingDirectory
    )
    $cmdLine = "cmd.exe /c `"$Command`""
    try {
        $res = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
            CommandLine = $cmdLine
            CurrentDirectory = $WorkingDirectory
        } -ErrorAction Stop
        if ($res.ReturnValue -eq 0) { return }
    } catch {}

    Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$Command`"" -WorkingDirectory $WorkingDirectory -WindowStyle Hidden
}

# 1. Detect Python Executable
$PyBin = "python"
if (Test-Path "$ProjectDir\.venv\Scripts\python.exe") {
    $PyBin = "$ProjectDir\.venv\Scripts\python.exe"
} elseif (Test-Path "$ProjectDir\venv\Scripts\python.exe") {
    $PyBin = "$ProjectDir\venv\Scripts\python.exe"
} elseif (Get-Command "python" -ErrorAction SilentlyContinue) {
    $PyBin = "python"
} elseif (Get-Command "py" -ErrorAction SilentlyContinue) {
    $PyBin = "py"
} elseif (Get-Command "python3" -ErrorAction SilentlyContinue) {
    $PyBin = "python3"
}
Write-Host "🐍 Using Python: $PyBin" -ForegroundColor Gray

# 2. Check/Start PostgreSQL & CloudBeaver via Docker Compose (if docker is installed)
$dockerCmd = Get-Command "docker" -ErrorAction SilentlyContinue
if ($dockerCmd -and (Test-Path "$ProjectDir\docker-compose.yml")) {
    Write-Host "🐘 Checking/Starting PostgreSQL Database Container via Docker Compose..." -ForegroundColor Yellow
    Start-Process -FilePath "docker" -ArgumentList "compose up -d" -WorkingDirectory $ProjectDir -NoNewWindow -Wait -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
} else {
    Write-Host "ℹ️ PostgreSQL check: Docker not found or PostgreSQL running natively on port 5432." -ForegroundColor DarkGray
}

# 3. Start Edge AI Backend (FastAPI on Port 8001)
if (Test-PortListening -Port 8001) {
    Write-Host "⚡ Edge AI Backend is already running on http://localhost:8001" -ForegroundColor Yellow
} else {
    Write-Host "🚀 Launching Edge AI Backend Server (FastAPI on Port 8001)..." -ForegroundColor Green
    $backendImx8Dir = Join-Path $ProjectDir "backend_imx8"
    $backendLog = Join-Path $ProjectDir "backend_imx8.log"
    Start-DetachedCmd -Command "`"$PyBin`" -m uvicorn main:app --host 0.0.0.0 --port 8001 > `"$backendLog`" 2>&1" -WorkingDirectory $backendImx8Dir
    Start-Sleep -Seconds 2
}

# 4. Start PC Central Backend (NestJS on Port 3000)
if (Test-PortListening -Port 3000) {
    Write-Host "⚙️ NestJS PC Central Backend is already running on http://localhost:3000" -ForegroundColor Yellow
} else {
    Write-Host "🪺 Launching PC Central Backend Server (NestJS on Port 3000)..." -ForegroundColor Green
    $backendPcDir = Join-Path $ProjectDir "backend_pc"
    $backendPcLog = Join-Path $ProjectDir "backend_pc.log"
    
    if (Test-Path (Join-Path $backendPcDir "dist\main.js")) {
        $nodeCmd = "node dist/main.js"
    } else {
        $nodeCmd = "npx ts-node src/main.ts"
    }

    Start-DetachedCmd -Command "$nodeCmd > `"$backendPcLog`" 2>&1" -WorkingDirectory $backendPcDir
    Start-Sleep -Seconds 2
}

# 5. Start Frontend HMI Dev Server (React 19 + Vite on Port 5173)
if (Test-PortListening -Port 5173) {
    Write-Host "💻 Frontend HMI server is already running on http://localhost:5173" -ForegroundColor Yellow
} else {
    Write-Host "💻 Launching React 19 HMI Frontend Server (Vite on Port 5173)..." -ForegroundColor Green
    $frontendDir = Join-Path $ProjectDir "frontend"
    $frontendLog = Join-Path $ProjectDir "frontend.log"

    Start-DetachedCmd -Command "npm run dev > `"$frontendLog`" 2>&1" -WorkingDirectory $frontendDir
    Start-Sleep -Seconds 2
}

# 6. Automatically Open Web Browser
$URL = "http://localhost:5173"
Write-Host "🌐 Opening Web HMI Dashboard at $URL ..." -ForegroundColor Cyan
try {
    Start-Process $URL
} catch {
    Write-Host "Could not open browser automatically. Please open $URL manually." -ForegroundColor Yellow
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "✅ All nodes launched successfully!" -ForegroundColor Green
Write-Host "👉 HMI Dashboard URL:        $URL" -ForegroundColor White
Write-Host "👉 i.MX8 Edge API (Port 8001): http://localhost:8001/docs" -ForegroundColor White
Write-Host "👉 PC NestJS API (Port 3000):  http://localhost:3000/api/v1/latest-inspection" -ForegroundColor White
Write-Host "👉 Logs saved to:            backend_imx8.log, backend_pc.log & frontend.log" -ForegroundColor Gray
Write-Host "👉 To stop all nodes:        Run .\stop.ps1 or stop.bat" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Cyan
