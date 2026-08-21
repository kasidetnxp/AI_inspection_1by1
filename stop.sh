#!/bin/bash
# ==============================================================================
# Edge AI Semiconductor Wafer Defect Inspection System - One-Click Shutdown
# ==============================================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR" || exit 1

echo "============================================================"
echo "Stopping Wafer AI Inspection System (All Nodes)..."
echo "============================================================"

# Stop i.MX8 Edge Backend
pkill -f "uvicorn main:app" > /dev/null 2>&1
fuser -k 8001/tcp > /dev/null 2>&1 && echo "✅ i.MX8 Edge Backend terminated." || echo "ℹ️ i.MX8 Edge Backend was not running."

# Stop NestJS PC Central Backend
pkill -f "backend_pc" && echo "✅ NestJS PC Central Backend terminated." || echo "ℹ️ NestJS PC Central Backend was not running."
fuser -k 3000/tcp > /dev/null 2>&1

# Stop & remove PostgreSQL Database Containers (Docker Compose Down)
if command -v docker > /dev/null 2>&1 && [ -f "docker-compose.yml" ]; then
    echo "🐘 Shutting down PostgreSQL Docker Containers (docker compose down)..."
    docker compose down > /dev/null 2>&1 || sudo docker compose down > /dev/null 2>&1
fi


# Stop Frontend Process
pkill -f "vite" && echo "✅ Frontend process terminated." || echo "ℹ️ Frontend process was not running."

echo "============================================================"
echo "✨ All services and database containers stopped clean."
echo "============================================================"

