#!/bin/bash
# ==============================================================================
# Edge AI Semiconductor Wafer Defect Inspection System - One-Click Shutdown
# ==============================================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR" || exit 1

echo "============================================================"
echo "Stopping Wafer AI Inspection System (All Nodes)..."
echo "============================================================"

kill_port() {
    local PORT=$1
    local NAME=$2
    local KILLED=0
    
    if command -v fuser > /dev/null 2>&1; then
        fuser -k "$PORT/tcp" > /dev/null 2>&1 && KILLED=1
    fi

    # Fallback for Windows Git Bash / Cygwin using powershell & taskkill
    if command -v powershell.exe > /dev/null 2>&1; then
        powershell.exe -NoProfile -Command "
            \$conn = Get-NetTCPConnection -LocalPort $PORT -ErrorAction SilentlyContinue
            if (\$conn) {
                \$conn | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
                    if (\$_ -gt 0) { taskkill.exe /F /PID \$_ /T 2>`$null | Out-Null }
                }
            }
        " > /dev/null 2>&1 && KILLED=1
    fi

    if [ $KILLED -eq 1 ]; then
        echo "✅ $NAME terminated (port $PORT)."
    else
        echo "ℹ️ $NAME was not running (port $PORT)."
    fi
}

# Stop i.MX8 Edge Backend
kill_port 8001 "i.MX8 Edge Backend"
pkill -f "uvicorn main:app" > /dev/null 2>&1 || true

# Stop NestJS PC Central Backend
kill_port 3000 "NestJS PC Central Backend"
pkill -f "backend_pc" > /dev/null 2>&1 || true

# Stop Frontend Process
kill_port 5173 "React 19 Frontend HMI"
pkill -f "vite" > /dev/null 2>&1 || true

# Stop & remove PostgreSQL Database Containers (Docker Compose Down)
if command -v docker > /dev/null 2>&1 && [ -f "docker-compose.yml" ]; then
    echo "🐘 Shutting down PostgreSQL Docker Containers (docker compose down)..."
    docker compose down > /dev/null 2>&1 || true
fi

echo "============================================================"
echo "✨ All services and database containers stopped clean."
echo "============================================================"
