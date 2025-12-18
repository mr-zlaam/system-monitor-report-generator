#!/bin/bash

set -e

INSTALL_DIR="/usr/local/bin"
BINARY_NAME="denoo"
SOURCE_BINARY="./dist/monitor"
SERVICE_NAME="denoo"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

echo "Denoo System Monitor Installer"
echo "=============================="

if [ ! -f "$SOURCE_BINARY" ]; then
    echo "Binary not found. Building..."
    bun run compile
fi

if [ ! -f "$SOURCE_BINARY" ]; then
    echo "Error: Failed to build binary"
    exit 1
fi

echo "Installing binary to $INSTALL_DIR..."
sudo cp "$SOURCE_BINARY" "$INSTALL_DIR/$BINARY_NAME"
sudo chmod +x "$INSTALL_DIR/$BINARY_NAME"

echo "Creating systemd service..."
sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Denoo System Monitor
After=network.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/$BINARY_NAME start
Restart=always
RestartSec=10
User=$USER

[Install]
WantedBy=multi-user.target
EOF

echo "Enabling and starting service..."
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl start "$SERVICE_NAME"

echo ""
echo "Installation complete!"
echo ""
echo "Commands:"
echo "  denoo              - Run manually"
echo "  denoo status       - Check service status"
echo "  denoo stop         - Stop service"
echo "  denoo start        - Start service"
echo "  denoo logs         - View logs"
echo ""
echo "Service commands:"
echo "  sudo systemctl status denoo   - Check status"
echo "  sudo systemctl stop denoo     - Stop service"
echo "  sudo systemctl start denoo    - Start service"
echo "  sudo systemctl restart denoo  - Restart service"
