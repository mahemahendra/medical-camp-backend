#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Medical Camp Manager - GCP e2-micro VM Setup Script
# ─────────────────────────────────────────────────────────────
# Run this ONCE on a fresh Debian 12 / Ubuntu 22.04 e2-micro VM
#
# Usage:
#   chmod +x setup-vm.sh
#   sudo ./setup-vm.sh
#
# After this script, manually:
#   1. Set up .env file in /home/app/medical-camp-backend/
#   2. Run: sudo -u app bash deploy/deploy.sh
#   3. Seed admin: cd /home/app/medical-camp-backend && npm run seed:admin
# ─────────────────────────────────────────────────────────────

set -euo pipefail

echo "╔══════════════════════════════════════════════╗"
echo "║  Medical Camp - GCP VM Setup                 ║"
echo "╚══════════════════════════════════════════════╝"

# ── 1. System Updates ──
echo "▶ Updating system packages..."
apt-get update -y && apt-get upgrade -y

# ── 2. Create app user ──
echo "▶ Creating 'app' user..."
if ! id "app" &>/dev/null; then
  useradd -m -s /bin/bash app
  echo "Created user 'app'"
else
  echo "User 'app' already exists"
fi

# ── 3. Install essential packages ──
echo "▶ Installing essentials..."
apt-get install -y curl wget git build-essential ufw

# ── 4. Install Node.js 20 LTS ──
echo "▶ Installing Node.js 20..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "Node.js $(node -v) installed"
echo "npm $(npm -v) installed"

# ── 5. Install PM2 globally ──
echo "▶ Installing PM2..."
npm install -g pm2

# ── 6. Install PostgreSQL 15 ──
echo "▶ Installing PostgreSQL 15..."
if ! command -v psql &>/dev/null; then
  apt-get install -y postgresql postgresql-contrib
fi
systemctl enable postgresql
systemctl start postgresql

# Create database and user
echo "▶ Setting up database..."
sudo -u postgres psql -c "SELECT 1 FROM pg_roles WHERE rolname='medcamp'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER medcamp WITH PASSWORD 'medcamp_secure_pw_change_me';"
sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname='medical_camp_db'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE medical_camp_db OWNER medcamp;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE medical_camp_db TO medcamp;"
echo "Database 'medical_camp_db' ready"

# ── 7. Install Nginx ──
echo "▶ Installing Nginx..."
apt-get install -y nginx
systemctl enable nginx

# ── 8. Create swap (e2-micro only has 614MB RAM) ──
echo "▶ Setting up 1GB swap..."
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap created"
else
  echo "Swap already exists"
fi

# ── 9. Configure firewall ──
echo "▶ Configuring firewall (UFW)..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
echo "Firewall configured: SSH, HTTP, HTTPS allowed"

# ── 10. Create directories ──
echo "▶ Creating app directories..."
mkdir -p /home/app/logs
mkdir -p /home/app/medical-camp-backend/uploads
mkdir -p /home/app/medical-camp-frontend
chown -R app:app /home/app

# ── 11. Set up PM2 startup (auto-start on boot) ──
echo "▶ Configuring PM2 startup..."
pm2 startup systemd -u app --hp /home/app
env PATH=$PATH:/usr/bin pm2 startup systemd -u app --hp /home/app

# ── 12. Deploy Nginx config ──
echo "▶ Note: After cloning repos, copy nginx config:"
echo "   sudo cp /home/app/medical-camp-backend/deploy/nginx.conf /etc/nginx/sites-available/medical-camp"
echo "   sudo ln -sf /etc/nginx/sites-available/medical-camp /etc/nginx/sites-enabled/"
echo "   sudo rm -f /etc/nginx/sites-enabled/default"
echo "   sudo nginx -t && sudo systemctl reload nginx"

# ── Done ──
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✅ VM Setup Complete!                       ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Switch to app user:  sudo su - app"
echo "  2. Clone repos:"
echo "     git clone YOUR_BACKEND_REPO /home/app/medical-camp-backend"
echo "     git clone YOUR_FRONTEND_REPO /home/app/medical-camp-frontend"
echo "  3. Create .env:  cp .env.example .env && nano .env"
echo "  4. Deploy:  bash deploy/deploy.sh"
echo "  5. Seed admin:  cd /home/app/medical-camp-backend && npm run seed:admin"
echo ""
echo "PostgreSQL credentials (CHANGE THE PASSWORD in .env):"
echo "  User: medcamp"
echo "  Password: medcamp_secure_pw_change_me"
echo "  Database: medical_camp_db"
echo "  URL: postgresql://medcamp:medcamp_secure_pw_change_me@localhost:5432/medical_camp_db"
echo ""
