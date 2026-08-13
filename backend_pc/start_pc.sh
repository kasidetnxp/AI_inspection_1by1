#!/bin/bash
# Launcher script for PC NestJS Central Server
PROJECT_DIR="/home/nxp1/Desktop/PUNPUNJA/PROJECT/UIIU"
cd "$PROJECT_DIR/backend_pc" || exit 1

echo "🪺 Starting NestJS Central Backend on PC Node (Port 3000)..."

if [ ! -d "node_modules" ]; then
    echo "📦 Installing NestJS dependencies..."
    npm install
fi

export EDGE_IP="${EDGE_IP:-10.42.0.95}"
nohup npx ts-node src/main.ts < /dev/null > "$PROJECT_DIR/backend_pc.log" 2>&1 &
echo "✅ NestJS PC Central Backend running on http://localhost:3000"
