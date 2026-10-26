# ==============================================================================
# Edge AI Semiconductor Wafer Defect Inspection System - One-Click Shutdown (Windows)
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ProjectDir = $PSScriptRoot
Set-Location -Path $ProjectDir

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Stopping Wafer AI Inspection System (All Windows Nodes)..." -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

function Stop-PortProcess {
    param(
        [int]$Port,
        [string]$ServiceName
    )
    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($connections) {
        $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 0 }
        $stopped = $false
        foreach ($procId in $pids) {
            try {
                taskkill.exe /F /PID $procId /T 2>$null | Out-Null
                $stopped = $true
            } catch {}
        }
        if ($stopped) {
            Write-Host "✅ $ServiceName terminated (Port $Port)." -ForegroundColor Green
        } else {
            Write-Host "ℹ️ $ServiceName could not be terminated directly." -ForegroundColor Yellow
        }
    } else {
        Write-Host "ℹ️ $ServiceName was not running on Port $Port." -ForegroundColor DarkGray
    }
}

# Stop Port 8001 (i.MX8 Edge Backend)
Stop-PortProcess -Port 8001 -ServiceName "i.MX8 Edge Backend"

# Stop Port 3000 (NestJS PC Central Backend)
Stop-PortProcess -Port 3000 -ServiceName "NestJS PC Central Backend"

# Stop Port 5173 (Frontend HMI Dev Server)
Stop-PortProcess -Port 5173 -ServiceName "React 19 Frontend HMI"

# Docker Compose Down if docker is installed
$dockerCmd = Get-Command "docker" -ErrorAction SilentlyContinue
if ($dockerCmd -and (Test-Path "$ProjectDir\docker-compose.yml")) {
    Write-Host "🐘 Shutting down PostgreSQL Docker Containers (docker compose down)..." -ForegroundColor Yellow
    Start-Process -FilePath "docker" -ArgumentList "compose down" -WorkingDirectory $ProjectDir -NoNewWindow -Wait -ErrorAction SilentlyContinue
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "✨ All services and database containers stopped clean." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
