#!/bin/bash
set -euo pipefail

APP_DIR="/opt/apps/anh-here"
LOG_FILE="/var/log/deploy-anh-here.log"

echo "[$(date -Iseconds)] === Deploy avviato ===" >> "$LOG_FILE"

cd "$APP_DIR"
git pull origin multitenancy >> "$LOG_FILE" 2>&1

docker compose pull >> "$LOG_FILE" 2>&1 || true
docker compose up --build -d --force-recreate >> "$LOG_FILE" 2>&1

docker image prune -f >> "$LOG_FILE" 2>&1

echo "[$(date -Iseconds)] === Deploy completato ===" >> "$LOG_FILE"
