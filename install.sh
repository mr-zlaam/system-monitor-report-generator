#!/bin/bash

set -e

INSTALL_DIR="/usr/local/bin"
BINARY_NAME="denoo"
SOURCE_BINARY="./dist/monitor"

echo "Installing $BINARY_NAME..."

if [ ! -f "$SOURCE_BINARY" ]; then
    echo "Binary not found. Building..."
    bun run compile
fi

if [ ! -f "$SOURCE_BINARY" ]; then
    echo "Error: Failed to build binary"
    exit 1
fi

sudo cp "$SOURCE_BINARY" "$INSTALL_DIR/$BINARY_NAME"
sudo chmod +x "$INSTALL_DIR/$BINARY_NAME"

echo "Installed successfully!"
echo "Run 'denoo' to start using the monitor."
