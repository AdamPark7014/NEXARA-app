#!/bin/bash
# ============================================================================
# Emergency Recovery & Diagnostics Script
# Ejecutar en el servidor cuando se recupere del cuelgue
# ============================================================================

set -e

echo "🔍 [1/10] Checking Docker status..."
docker ps -a --filter name=nexara --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "🔍 [2/10] Killing any stuck processes..."
pkill -9 docker-buildx || true
pkill -9 node || true
sleep 2

echo ""
echo "🔍 [3/10] Restarting Docker daemon..."
systemctl restart docker || service docker restart || echo "Could not restart docker service"
sleep 5

echo ""
echo "🔍 [4/10] Pulling latest code..."
cd /var/www/nexara-app
git fetch origin
git reset --hard origin/main

echo ""
echo "🔍 [5/10] Removing old containers..."
docker compose -f deploy/docker-compose.nexara.yml --env-file deploy/.env.nexara down || true
sleep 3

echo ""
echo "🔍 [6/10] Starting fresh containers (no build - using cache)..."
docker compose -f deploy/docker-compose.nexara.yml --env-file deploy/.env.nexara up -d
sleep 10

echo ""
echo "🔍 [7/10] Checking container status..."
docker ps -a --filter name=nexara --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "🔍 [8/10] Testing API connectivity..."
docker logs nexara-api --tail=20 2>&1 | tail -10

echo ""
echo "🔍 [9/10] Testing Web connectivity..."
docker logs nexara-web --tail=20 2>&1 | tail -10

echo ""
echo "🔍 [10/10] Verifying database user 'gerencia@nexara.com.mx'..."
docker exec nexara-db psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} \
  -c "SELECT id, nombre, email, roleId FROM \"User\" WHERE email='gerencia@nexara.com.mx';" 2>&1 || echo "Could not verify user"

echo ""
echo "✅ Recovery script completed!"
echo ""
echo "Next steps:"
echo "  1. Test console at: https://consola.nexara.com.mx"
echo "  2. Test API at: curl https://api.nexara.com.mx/api/health"
echo "  3. Check logs: docker logs nexara-api -f"
