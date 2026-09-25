#!/bin/bash
# ==============================================================================
# i.MX8 Edge AI Backend - Auto-Start Setup Script for Linux Yocto / i.MX8
# ==============================================================================
# Usage:
#   chmod +x setup_autostart_imx8.sh
#   bash setup_autostart_imx8.sh
# ==============================================================================

echo "======================================================="
echo "  Setting up i.MX8 Edge AI Backend Auto-Start Service   "
echo "======================================================="

APP_DIR=$(cd "$(dirname "$0")" && pwd)
PYTHON_BIN=$(which python3 || echo "/usr/bin/python3")
SERVICE_FILE="/etc/systemd/system/backend_imx8.service"

echo "[INFO] Project Directory: $APP_DIR"
echo "[INFO] Python Binary:     $PYTHON_BIN"
echo "[INFO] Target Service:    $SERVICE_FILE"

# 1. Install Python dependencies if requirements.txt exists
if [ -f "$APP_DIR/requirements.txt" ] && command -v pip3 &> /dev/null; then
    echo "[INFO] Installing Python dependencies from requirements.txt..."
    pip3 install -r "$APP_DIR/requirements.txt" --quiet || true
fi

# 2. Ensure Fast RAM-disk buffer directory exists
mkdir -p /tmp/imx8_process

# 3. Generate systemd service configuration (Port 8001)
echo "[INFO] Writing systemd service configuration..."
cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=i.MX8 Edge AI Wafer Inspection Backend (FastAPI Port 8001)
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
ExecStart=$PYTHON_BIN -m uvicorn main:app --host 0.0.0.0 --port 8001
Restart=always
RestartSec=3
Environment=PYTHONUNBUFFERED=1
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# 4. Reload systemd daemon
echo "[INFO] Reloading systemd daemon..."
systemctl daemon-reload

# 5. Enable service on boot
echo "[INFO] Enabling backend_imx8.service on boot..."
systemctl enable backend_imx8.service

# 6. Restart service now
echo "[INFO] Starting backend_imx8.service now..."
systemctl restart backend_imx8.service

echo "======================================================="
echo "  backend_imx8 Service Setup Complete! Current Status: "
echo "======================================================="
systemctl status backend_imx8.service --no-pager || true
