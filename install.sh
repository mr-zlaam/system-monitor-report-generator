#!/bin/bash

set -e

REPO="mr-zlaam/system-monitor-report-generator"
INSTALL_DIR="/usr/local/bin"
SERVICE_NAME="denoo"
BINARY_NAME="denoo"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() { echo -e "${GREEN}[OK]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

if [ "$EUID" -ne 0 ]; then
    print_error "Please run as root (use sudo)"
    exit 1
fi

echo ""
echo "╔════════════════════════════════════════╗"
echo "║     Denoo System Monitor Installer     ║"
echo "╚════════════════════════════════════════╝"
echo ""

LATEST_RELEASE=$(curl -s "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$LATEST_RELEASE" ]; then
    print_error "Could not fetch latest release"
    exit 1
fi

print_status "Latest version: ${LATEST_RELEASE}"

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${LATEST_RELEASE}/denoo-linux-x64.tar.gz"

echo "Downloading ${BINARY_NAME}..."
TMP_DIR=$(mktemp -d)
curl -sL "$DOWNLOAD_URL" -o "${TMP_DIR}/denoo.tar.gz"

echo "Extracting..."
tar -xzf "${TMP_DIR}/denoo.tar.gz" -C "${TMP_DIR}"

echo "Installing to ${INSTALL_DIR}..."
mv "${TMP_DIR}/denoo" "${INSTALL_DIR}/${BINARY_NAME}"
chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

rm -rf "${TMP_DIR}"

print_status "Binary installed to ${INSTALL_DIR}/${BINARY_NAME}"

echo ""
echo "Creating systemd service..."

REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(eval echo "~${REAL_USER}")

cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=Denoo System Monitor
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${REAL_USER}
ExecStart=${INSTALL_DIR}/${BINARY_NAME} start
Restart=always
RestartSec=30
Environment=HOME=${REAL_HOME}
Environment=XDG_CONFIG_HOME=${REAL_HOME}/.config
Environment=DISPLAY=:0
WorkingDirectory=${REAL_HOME}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
print_status "Systemd service created"

echo ""
echo "╔════════════════════════════════════════╗"
echo "║         Installation Complete!         ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo ""
echo "  1. Run setup wizard:"
echo "     ${BINARY_NAME} setup"
echo ""
echo "  2. After setup, start as a service:"
echo "     sudo systemctl enable ${SERVICE_NAME}"
echo "     sudo systemctl start ${SERVICE_NAME}"
echo ""
echo "  Or run directly:"
echo "     ${BINARY_NAME} start"
echo ""
echo "Commands:"
echo "  ${BINARY_NAME} setup     - Configure notifications"
echo "  ${BINARY_NAME} start     - Start monitoring"
echo "  ${BINARY_NAME} status    - Quick system status"
echo "  ${BINARY_NAME} report    - Generate report now"
echo "  ${BINARY_NAME} config    - View/edit configuration"
echo ""
