#!/bin/bash
# Launcher script for i.MX8 Edge Node Backend
PROJECT_DIR="/home/nxp1/Desktop/PUNPUNJA/PROJECT/UIIU"
cd "$PROJECT_DIR" || exit 1

echo "🧠 Starting Edge AI Backend on i.MX8 Node (Port 8000)..."
nohup "$PROJECT_DIR/.venv/bin/python3" -m uvicorn backend_imx8.main:app --host 0.0.0.0 --port 8000 < /dev/null > "$PROJECT_DIR/backend_imx8.log" 2>&1 &
echo "✅ i.MX8 Edge Backend running on http://localhost:8000"
