#!/bin/bash
# EIP YouTube Uploader - Build Script
# Run this to build the desktop app for your platform

echo "========================================"
echo "  EIP YouTube Uploader - Build Script"
echo "========================================"
echo ""

# Install dependencies
echo "→ Installing dependencies..."
npm install

# Build renderer (React)
echo "→ Building renderer (React + Vite)..."
node_modules/.bin/vite build

# Build main process (Electron)
echo "→ Building main process (Electron)..."
node_modules/.bin/tsc -p tsconfig.electron.json

echo ""
echo "Choose build target:"
echo "  1) Windows (.exe installer)"
echo "  2) macOS (.dmg)"
echo "  3) Linux (.AppImage)"
echo "  4) All platforms"
read -p "Enter choice [1-4]: " choice

case $choice in
  1)
    echo "→ Building for Windows..."
    node_modules/.bin/electron-builder --win
    ;;
  2)
    echo "→ Building for macOS..."
    node_modules/.bin/electron-builder --mac
    ;;
  3)
    echo "→ Building for Linux..."
    node_modules/.bin/electron-builder --linux
    ;;
  4)
    echo "→ Building for all platforms..."
    node_modules/.bin/electron-builder --win --mac --linux
    ;;
  *)
    echo "Invalid choice. Building for current platform..."
    node_modules/.bin/electron-builder
    ;;
esac

echo ""
echo "✓ Build complete! Check the release/ folder."
