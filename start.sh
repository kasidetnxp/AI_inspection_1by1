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

# Detect Python Executable
if [ -f "$PROJECT_DIR/.venv/bin/python3" ]; then
    PY_BIN="$PROJECT_DIR/.venv/bin/python3"
elif [ -f "$PROJECT_DIR/venv/bin/python3" ]; then
    PY_BIN="$PROJECT_DIR/venv/bin/python3"
elif command -v python3 > /dev/null 2>&1; then
    PY_BIN="python3"
else
    PY_BIN="python"
fi

# Start PostgreSQL & CloudBeaver Database Containers (Docker Compose)
if command -v docker > /dev/null 2>&1 && [ -f "docker-compose.yml" ]; then
    echo "Starting PostgreSQL Database Container via Docker Compose..."
    docker compose up -d > /dev/null 2>&1 || sudo docker compose up -d > /dev/null 2>&1
    sleep 1
else
    echo "Docker not available. System will fallback to local SQLite database."
fi


# 1. Start Edge AI Backend (FastAPI on Port 8001)
if lsof -iTCP:8001 -sTCP:LISTEN > /dev/null 2>&1 || nc -z 127.0.0.1 8001 > /dev/null 2>&1; then
    echo "Edge AI Backend is already running on http://localhost:8001"
else
    echo "Launching Edge AI Backend Server (FastAPI on PC)..."
    
    # [Mode A: Local PC Execution - Active]
    cd "$PROJECT_DIR/backend_imx8" || exit 1
    nohup setsid "$PY_BIN" -m uvicorn main:app --host 0.0.0.0 --port 8001 < /dev/null > "$PROJECT_DIR/backend_imx8.log" 2>&1 &
    cd "$PROJECT_DIR" || exit 1

    # [Mode B: Physical i.MX8 Hardware Execution]
    # If running backend directly on physical i.MX8 board (10.42.0.95), comment out Mode A above.
    # echo "ℹ️ Connecting to remote i.MX8 Board at http://10.42.0.95:8001"

    sleep 2
fi

# 2. Start PC Central Backend (NestJS on Port 3000)
if lsof -iTCP:3000 -sTCP:LISTEN > /dev/null 2>&1 || nc -z 127.0.0.1 3000 > /dev/null 2>&1; then
    echo "⚙️ NestJS PC Central Backend is already running on http://localhost:3000"
else
    echo "🪺 Launching PC Central Backend Server (NestJS)..."
    cd "$PROJECT_DIR/backend_pc" || exit 1
    nohup npx ts-node src/main.ts < /dev/null > "$PROJECT_DIR/backend_pc.log" 2>&1 &
    cd "$PROJECT_DIR" || exit 1
    sleep 2
fi

# 3. Start Frontend HMI Dev Server (React 19 + Vite on Port 5173)
if lsof -iTCP:5173 -sTCP:LISTEN > /dev/null 2>&1 || nc -z 127.0.0.1 5173 > /dev/null 2>&1; then
    echo "💻 Frontend HMI server is already running on http://localhost:5173"
else
    echo "💻 Launching React 19 HMI Frontend Server..."
    cd "$PROJECT_DIR/frontend" || exit 1
    nohup npm run dev < /dev/null > "$PROJECT_DIR/frontend.log" 2>&1 &
    cd "$PROJECT_DIR" || exit 1
    sleep 2
fi

# 4. Automatically Open Web Browser
URL="http://localhost:5173"
echo "🌐 Opening Web HMI Dashboard at $URL ..."
if command -v xdg-open > /dev/null; then
    xdg-open "$URL" > /dev/null 2>&1 &
elif command -v google-chrome > /dev/null; then
    google-chrome "$URL" > /dev/null 2>&1 &
elif command -v firefox > /dev/null; then
    firefox "$URL" > /dev/null 2>&1 &
fi

echo "============================================================"
echo "✅ All nodes launched successfully!"
echo "👉 HMI Dashboard URL:        $URL"
echo "👉 i.MX8 Edge API (Port 8001): http://localhost:8001/docs"
echo "👉 PC NestJS API (Port 3000):  http://localhost:3000/api/v1/latest-inspection"
echo "👉 Logs saved to:            backend_imx8.log, backend_pc.log & frontend.log"
echo "👉 To stop all nodes:        ./stop.sh"
echo "============================================================"
