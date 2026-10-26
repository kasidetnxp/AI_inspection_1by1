#!/bin/bash
# ==============================================================================
# Edge AI Semiconductor Wafer Defect Inspection System - One-Click Launcher
# (Dual-Node: i.MX8 Edge Backend + NestJS PC Central Backend + React 19 HMI)
# ==============================================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR" || exit 1

echo "============================================================"
echo "Starting Edge AI Wafer Inspection System (Multi-Node)..."
echo "============================================================"

# Detect Python Executable (Linux/macOS + Windows venv paths)
if [ -f "$PROJECT_DIR/.venv/bin/python3" ]; then
    PY_BIN="$PROJECT_DIR/.venv/bin/python3"
elif [ -f "$PROJECT_DIR/venv/bin/python3" ]; then
    PY_BIN="$PROJECT_DIR/venv/bin/python3"
elif [ -f "$PROJECT_DIR/.venv/Scripts/python.exe" ]; then
    PY_BIN="$PROJECT_DIR/.venv/Scripts/python.exe"
elif [ -f "$PROJECT_DIR/venv/Scripts/python.exe" ]; then
    PY_BIN="$PROJECT_DIR/venv/Scripts/python.exe"
elif command -v python3 > /dev/null 2>&1; then
    PY_BIN="python3"
else
    PY_BIN="python"
fi

# Detect Background Runner (setsid is not available in Git Bash / MSYS on Windows)
if command -v setsid > /dev/null 2>&1; then
    BG_RUN="nohup setsid"
else
    BG_RUN="nohup"
fi

# Helper function to check if a TCP port is in LISTEN state
is_port_listening() {
    local PORT=$1
    if command -v lsof > /dev/null 2>&1; then
        lsof -iTCP:"$PORT" -sTCP:LISTEN > /dev/null 2>&1 && return 0
    fi
    if command -v nc > /dev/null 2>&1; then
        nc -z 127.0.0.1 "$PORT" > /dev/null 2>&1 && return 0
    fi
    if command -v netstat > /dev/null 2>&1; then
        netstat -ano 2>/dev/null | grep -q ":$PORT .*LISTENING" && return 0
    fi
    return 1
}

# Start PostgreSQL & CloudBeaver Database Containers (Docker Compose) if docker is used
if command -v docker > /dev/null 2>&1 && [ -f "docker-compose.yml" ]; then
    echo "Checking/Starting PostgreSQL Database Container via Docker Compose..."
    docker compose up -d > /dev/null 2>&1 || true
    sleep 1
else
    echo "PostgreSQL service is running natively on port 5432 (or Docker not detected)."
fi

# 1. Start Edge AI Backend (FastAPI on Port 8001)
if is_port_listening 8001; then
    echo "⚡ Edge AI Backend is already running on http://localhost:8001"
else
    echo "🚀 Launching Edge AI Backend Server (FastAPI on Port 8001)..."
    
    # [Mode A: Local PC Execution - Active]
    cd "$PROJECT_DIR/backend_imx8" || exit 1
    $BG_RUN "$PY_BIN" -m uvicorn main:app --host 0.0.0.0 --port 8001 < /dev/null > "$PROJECT_DIR/backend_imx8.log" 2>&1 &
    cd "$PROJECT_DIR" || exit 1

    sleep 2
fi

# 2. Start PC Central Backend (NestJS on Port 3000)
if is_port_listening 3000; then
    echo "⚙️ NestJS PC Central Backend is already running on http://localhost:3000"
else
    echo "🪺 Launching PC Central Backend Server (NestJS on Port 3000)..."
    cd "$PROJECT_DIR/backend_pc" || exit 1
    if [ -f "dist/main.js" ]; then
        $BG_RUN node dist/main.js < /dev/null > "$PROJECT_DIR/backend_pc.log" 2>&1 &
    else
        $BG_RUN npx ts-node src/main.ts < /dev/null > "$PROJECT_DIR/backend_pc.log" 2>&1 &
    fi
    cd "$PROJECT_DIR" || exit 1
    sleep 2
fi

# 3. Start Frontend HMI Dev Server (React 19 + Vite on Port 5173)
if is_port_listening 5173; then
    echo "💻 Frontend HMI server is already running on http://localhost:5173"
else
    echo "💻 Launching React 19 HMI Frontend Server (Vite on Port 5173)..."
    cd "$PROJECT_DIR/frontend" || exit 1
    $BG_RUN npm run dev < /dev/null > "$PROJECT_DIR/frontend.log" 2>&1 &
    cd "$PROJECT_DIR" || exit 1
    sleep 2
fi

# 4. Automatically Open Web Browser
URL="http://localhost:5173"
echo "🌐 Opening Web HMI Dashboard at $URL ..."
if command -v xdg-open > /dev/null 2>&1; then
    xdg-open "$URL" > /dev/null 2>&1 &
elif command -v start > /dev/null 2>&1; then
    start "$URL" > /dev/null 2>&1 &
elif command -v cmd.exe > /dev/null 2>&1; then
    cmd.exe /c start "$URL" > /dev/null 2>&1 &
elif command -v google-chrome > /dev/null 2>&1; then
    google-chrome "$URL" > /dev/null 2>&1 &
elif command -v firefox > /dev/null 2>&1; then
    firefox "$URL" > /dev/null 2>&1 &
fi

echo "============================================================"
echo "✅ All nodes launched successfully!"
echo "👉 HMI Dashboard URL:        $URL"
echo "👉 i.MX8 Edge API (Port 8001): http://localhost:8001/docs"
echo "👉 PC NestJS API (Port 3000):  http://localhost:3000/api/v1/latest-inspection"
echo "👉 Logs saved to:            backend_imx8.log, backend_pc.log & frontend.log"
echo "👉 To stop all nodes:        ./stop.sh (or .\\stop.ps1 / stop.bat)"
echo "============================================================"
