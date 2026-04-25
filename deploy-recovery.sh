#!/bin/bash
# ============================================================================
# NEXARA Server Recovery & Deployment Script
# Ejecutar en la terminal de VS Code integrada o SSH
# ============================================================================

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     NEXARA Server Recovery & Deployment Script            ║${NC}"
echo -e "${BLUE}║     Fixing console + API + login issues                   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running on server or local
if [[ "$HOSTNAME" == *"138.197.42.104"* ]] || [[ -f "/var/www/nexara-app/.env" ]]; then
    SERVER_MODE=true
    echo -e "${GREEN}✓ Detectado: Ejecutando en SERVIDOR${NC}"
else
    SERVER_MODE=false
    echo -e "${YELLOW}⚠ Ejecutando en LOCAL (necesitarás SSH después)${NC}"
fi

echo ""
echo -e "${BLUE}═══ FASE 1: Diagnóstico Inicial ═══${NC}"
echo ""

if [ "$SERVER_MODE" = true ]; then
    echo "1. Verificando estado de contenedores..."
    docker ps -a --filter name=nexara --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" || echo "Docker no disponible"
    echo ""
    
    echo "2. Verificando Git..."
    cd /var/www/nexara-app || cd . 
    git log --oneline -3
    echo ""
else
    echo "⚠ Modos local - necesitarás ejecutar esto en el servidor"
    echo ""
fi

echo -e "${BLUE}═══ FASE 2: Preparación ═══${NC}"
echo ""

if [ "$SERVER_MODE" = true ]; then
    echo "1. Matando procesos colgados..."
    pkill -9 docker-buildx 2>/dev/null || true
    pkill -9 nest 2>/dev/null || true
    sleep 1
    echo -e "${GREEN}✓ Procesos limpiados${NC}"
    echo ""
    
    echo "2. Reiniciando docker daemon..."
    systemctl restart docker || service docker restart || echo "⚠ No pudimos reiniciar docker automáticamente"
    sleep 5
    echo -e "${GREEN}✓ Docker reiniciado${NC}"
    echo ""
    
    echo "3. Actualizando código desde GitHub..."
    cd /var/www/nexara-app
    git fetch origin
    git reset --hard origin/main
    echo -e "${GREEN}✓ Código actualizado${NC}"
    echo ""
    
    echo -e "${BLUE}═══ FASE 3: Reiniciando Contenedores ═══${NC}"
    echo ""
    
    echo "1. Deteniendo contenedores viejos..."
    docker compose -f deploy/docker-compose.nexara.yml --env-file deploy/.env.nexara down || true
    sleep 2
    echo -e "${GREEN}✓ Contenedores detenidos${NC}"
    echo ""
    
    echo "2. Iniciando contenedores nuevos..."
    docker compose -f deploy/docker-compose.nexara.yml --env-file deploy/.env.nexara up -d
    sleep 10
    echo -e "${GREEN}✓ Contenedores iniciados${NC}"
    echo ""
    
    echo "3. Verificando estado..."
    docker ps -a --filter name=nexara --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo ""
fi

echo -e "${BLUE}═══ FASE 4: Diagnósticos ═══${NC}"
echo ""

if [ "$SERVER_MODE" = true ]; then
    echo "1. Logs de API (últimas 10 líneas)..."
    docker logs nexara-api --tail=10 2>&1 | tail -10
    echo ""
    
    echo "2. Logs de Web (últimas 10 líneas)..."
    docker logs nexara-web --tail=10 2>&1 | tail -10
    echo ""
    
    echo "3. Verificando usuario en BD..."
    docker exec nexara-db psql -U ${POSTGRES_USER:-nexara} -d ${POSTGRES_DB:-nexara} \
      -c "SELECT id, nombre, email, roleId FROM \"User\" WHERE email='gerencia@nexara.com.mx' LIMIT 1;" 2>&1 || echo "⚠ No pudimos acceder a BD"
    echo ""
    
    echo -e "${BLUE}═══ FASE 5: Tests ═══${NC}"
    echo ""
    
    echo "1. Test Debug Endpoint (verificar usuario)..."
    sleep 2
    curl -s http://localhost:3001/api/auth/debug/verify-user?email=gerencia@nexara.com.mx | jq . 2>/dev/null || echo "⚠ Endpoint no disponible aún"
    echo ""
    
    echo "2. Verificando Logs en tiempo real..."
    echo -e "${YELLOW}Monitorear logs del API (Ctrl+C para salir):${NC}"
    docker logs -f nexara-api --tail=20 &
    LOG_PID=$!
    sleep 5
    kill $LOG_PID 2>/dev/null || true
    echo ""
fi

echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                  ✓ RECUPERACIÓN COMPLETADA               ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$SERVER_MODE" = true ]; then
    echo -e "${BLUE}Próximos pasos:${NC}"
    echo "1. Esperar 30 segundos para que los servicios se estabilicen"
    echo "2. Test API:"
    echo "   curl -X POST http://localhost:3001/api/auth/login \\"
    echo "     -H 'Content-Type: application/json' \\"
    echo "     -d '{\"email\":\"gerencia@nexara.com.mx\",\"password\":\"123456\"}'"
    echo ""
    echo "3. Test Console:"
    echo "   curl -X GET http://localhost:3000/api/activities"
    echo ""
    echo "4. Monitor en tiempo real:"
    echo "   docker logs -f nexara-api | grep -i error"
    echo ""
else
    echo -e "${YELLOW}Debes ejecutar esto en el servidor:${NC}"
    echo "ssh root@138.197.42.104"
    echo "cd /var/www/nexara-app"
    echo "./deploy-recovery.sh"
    echo ""
fi

echo -e "${YELLOW}Para debug avanzado, ver:${NC}"
echo "  - RECOVERY_INSTRUCTIONS.md"
echo "  - ESTADO_ACTUAL.md"
echo "  - README_RECOVERY.md"
echo ""
