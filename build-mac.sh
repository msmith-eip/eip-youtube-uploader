#!/bin/bash
echo "========================================"
echo "  EIP YouTube Uploader - macOS Build"
echo "========================================"
echo ""

echo "→ Installing dependencies..."
npm install

echo "→ Building renderer (React + Vite)..."
node_modules/.bin/vite build

echo "→ Building main process (Electron)..."
node_modules/.bin/tsc -p tsconfig.electron.json

echo "→ Building macOS DMG..."
node_modules/.bin/electron-builder --mac

echo ""
echo "✓ Build complete! Check the release/ folder for the .dmg file."
