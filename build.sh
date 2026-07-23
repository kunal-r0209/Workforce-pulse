#!/bin/bash
set -e  # Exit immediately on any error

echo "======================================"
echo " Workforce Pulse — Production Build"
echo "======================================"

# ── 1. Build React frontend ───────────────────────────────
echo ""
echo "==> [1/3] Installing frontend dependencies..."
cd frontend
npm install --legacy-peer-deps

echo "==> [2/3] Building React app..."
npm run build
cd ..

# ── 2. Copy dist into backend/static ─────────────────────
echo ""
echo "==> [3/3] Copying build output to backend/static/..."
rm -rf backend/static
cp -r frontend/dist backend/static

echo ""
echo "======================================"
echo " Build complete! backend/static/ ready"
echo "======================================"
