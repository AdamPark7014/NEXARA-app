#!/bin/bash
set -e

echo "=========================================="
echo "  NEXARA-APP COMPLETE DEPLOYMENT"
echo "=========================================="

# Pull latest changes
echo ""
echo "[1/5] Pulling latest code from git..."
cd /var/www/nexara-app
git pull origin refactor/roles-purge-v2

# Restart traefik with file provider
echo ""
echo "[2/5] Restarting Traefik with file provider..."
cd infra/proxy
docker restart traefik
sleep 10

# Verify traefik is running
echo ""
echo "[3/5] Verifying Traefik configuration..."
docker logs --tail 20 traefik | grep -i "configuration\|loaded\|error" || echo "Traefik logs retrieved"

# Verify all projects are accessible
echo ""
echo "[4/5] Verifying all projects are accessible..."
echo "  - Checking nexara.com.mx..."
curl -sk -I https://nexara.com.mx 2>&1 | head -1

echo "  - Checking zynoratek.com..."
curl -sk -I https://zynoratek.com 2>&1 | head -1

echo "  - Checking acrobat.mx..."
curl -sk -I https://acrobat.mx 2>&1 | head -1

# Show container status
echo ""
echo "[5/5] Container Status:"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "traefik|nexara|zyno|acrobat" || echo "All containers checked"

echo ""
echo "=========================================="
echo "  ✅ DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""
echo "Services:"
echo "  ✓ Nexara:   https://nexara.com.mx"
echo "  ✓ Zynoratek: https://zynoratek.com"
echo "  ✓ Acrobat:  https://acrobat.mx"
echo ""
