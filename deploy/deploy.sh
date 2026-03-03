#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Medical Camp Manager - Deploy Script
# ─────────────────────────────────────────────────────────────
# Run this to deploy latest code to the GCP VM.
# Run as 'app' user: bash deploy/deploy.sh
#
# Can also be run remotely:
#   ssh app@YOUR_VM_IP 'cd /home/app/medical-camp-backend && bash deploy/deploy.sh'
# ─────────────────────────────────────────────────────────────

set -euo pipefail

APP_DIR="/home/app"
BACKEND_DIR="$APP_DIR/medical-camp-backend"
FRONTEND_DIR="$APP_DIR/medical-camp-frontend"

echo "╔══════════════════════════════════════════════╗"
echo "║  Medical Camp - Deploying...                 ║"
echo "╚══════════════════════════════════════════════╝"

# ── 1. Pull latest code ──
echo "▶ Pulling backend..."
cd "$BACKEND_DIR"
git pull origin main

echo "▶ Pulling frontend..."
cd "$FRONTEND_DIR"
git pull origin main

# ── 2. Install backend dependencies ──
echo "▶ Installing backend dependencies..."
cd "$BACKEND_DIR"
npm ci --production=false  # Need devDeps for TypeScript build

# ── 3. Build backend ──
echo "▶ Building backend..."
npm run build

# ── 4. Install frontend dependencies ──
echo "▶ Installing frontend dependencies..."
cd "$FRONTEND_DIR"
npm ci

# ── 5. Build frontend ──
echo "▶ Building frontend..."
npm run build

# ── 6. Restart backend with PM2 ──
echo "▶ Restarting backend..."
cd "$BACKEND_DIR"
pm2 startOrRestart deploy/ecosystem.config.js --env production
pm2 save

# ── 7. Reload Nginx (in case config changed) ──
echo "▶ Reloading Nginx..."
sudo nginx -t && sudo systemctl reload nginx

# ── Done ──
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✅ Deployment Complete!                     ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "Backend:  pm2 status / pm2 logs medical-camp-backend"
echo "Frontend: Served by Nginx from $FRONTEND_DIR/dist"
echo ""
