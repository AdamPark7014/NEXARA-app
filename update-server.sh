#!/bin/bash

# 🚀 Script para actualizar NEXARA-app en Digital Ocean
# Ejecutar estos comandos EN EL SERVIDOR después de conectarte con SSH

set -euo pipefail

PROJECT_DIR="/var/www/nexara-app"
API_PORT="${API_PORT:-3001}"
WEB_PORT="${WEB_PORT:-3000}"
MOBILE_PORT="${MOBILE_PORT:-3002}"
MOBILE_APP_URL="${MOBILE_APP_URL:-http://138.197.42.104:3002}"
SKIP_CAP_SYNC="${SKIP_CAP_SYNC:-0}"
HEALTHCHECK_RETRIES="${HEALTHCHECK_RETRIES:-30}"
HEALTHCHECK_DELAY="${HEALTHCHECK_DELAY:-2}"
HEALTHCHECK_TIMEOUT="${HEALTHCHECK_TIMEOUT:-8}"

start_or_restart_pm2() {
  local app_name="$1"
  shift

  if pm2 describe "$app_name" >/dev/null 2>&1; then
    echo "🔄 Reiniciando ${app_name}..."
    pm2 restart "$app_name" --update-env
  else
    echo "🚀 Iniciando ${app_name}..."
    pm2 start "$@" --name "$app_name"
  fi
}

# Forzar builds en serie para evitar sobrecarga/memoria por paralelismo.
BUILD_MODE="serial"

run_build_serial() {
  local target="$1"
  shift
  echo "🧱 Compilando ${target} en serie (${BUILD_MODE})..."
  "$@"
}

wait_for_endpoint() {
  local label="$1"
  local url="$2"
  local retries="$3"
  local delay="$4"
  local timeout="$5"

  local attempt=1
  while [ "$attempt" -le "$retries" ]; do
    if curl -fsS --max-time "$timeout" "$url" >/dev/null; then
      echo "✅ ${label} OK (${url})"
      return 0
    fi

    if [ "$attempt" -lt "$retries" ]; then
      echo "⏳ ${label} aún no responde (${attempt}/${retries}). Reintentando en ${delay}s..."
      sleep "$delay"
    fi

    attempt=$((attempt + 1))
  done

  echo "❌ ${label} no respondió tras ${retries} intentos (${url})"
  return 1
}

echo "🔄 Actualizando NEXARA-app desde GitHub..."

# 1. Ir al directorio del proyecto
cd "$PROJECT_DIR"

# 2. Hacer backup rápido de .env EN UN LUGAR SEGURO (fuera de git clean)
echo "💾 Haciendo backup de archivos .env..."
mkdir -p /tmp/nexara-backup
cp apps/api/.env /tmp/nexara-backup/.env.api 2>/dev/null || echo "⚠️  No se encontró apps/api/.env"
cp apps/web/.env.local /tmp/nexara-backup/.env.web 2>/dev/null || echo "⚠️  No se encontró apps/web/.env.local"
cp apps/mobile/.env.local /tmp/nexara-backup/.env.mobile 2>/dev/null || echo "⚠️  No se encontró apps/mobile/.env.local"

# 3. Detener servicios temporalmente
echo "⏸️ Deteniendo servicios..."
pm2 stop nexara-api || true
pm2 stop nexara-web || true
pm2 stop nexara-mobile || true

# 4. Actualizar código desde GitHub
echo "📥 Descargando últimos cambios..."
git fetch origin main
git reset --hard origin/main
git clean -fd

# 5. Restaurar archivos .env
echo "📂 Restaurando archivos .env..."
cp /tmp/nexara-backup/.env.api apps/api/.env 2>/dev/null || echo "⚠️  No se pudo restaurar apps/api/.env"
cp /tmp/nexara-backup/.env.web apps/web/.env.local 2>/dev/null || echo "⚠️  No se pudo restaurar apps/web/.env.local"
cp /tmp/nexara-backup/.env.mobile apps/mobile/.env.local 2>/dev/null || echo "⚠️  No se pudo restaurar apps/mobile/.env.local"

# Verificar que DATABASE_URL existe
if ! grep -q "DATABASE_URL" apps/api/.env 2>/dev/null; then
  echo "❌ ERROR: apps/api/.env no tiene DATABASE_URL"
  echo "Por favor, configura manualmente el archivo .env antes de continuar"
  exit 1
fi

# 6. Instalar dependencias del monorepo (workspaces)
echo "📦 Instalando dependencias del monorepo..."
npm install --legacy-peer-deps

# 7. Actualizar Backend (API)
echo "🔧 Actualizando Backend..."
cd apps/api
npx prisma generate
npx prisma migrate deploy
node ../../scripts/clear-build-cache.js api
run_build_serial "Backend" npm run build

# 8. Actualizar Frontend (Web)
echo "🎨 Actualizando Frontend..."
cd ../web
rm -rf .next
node ../../scripts/clear-build-cache.js web
run_build_serial "Frontend Web" env NODE_OPTIONS="--max_old_space_size=2048" npm run build

# 9. Actualizar Frontend (Mobile)
echo "📱 Actualizando Frontend Mobile..."
cd ../mobile
rm -rf .next
node ../../scripts/clear-build-cache.js mobile
run_build_serial "Frontend Mobile" env NODE_OPTIONS="--max_old_space_size=2048" npm run build

# Sincronizar shell nativo Capacitor con URL productiva
if [ "$SKIP_CAP_SYNC" = "1" ]; then
  echo "⏭️ Omitiendo sync de Capacitor (SKIP_CAP_SYNC=1)."
else
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$NODE_MAJOR" -lt 22 ]; then
    echo "⚠️ Omitiendo sync de Capacitor: Node $(node -v) < 22 requerido por @capacitor/cli@8"
    echo "   Si necesitas sincronizar shell nativo en este servidor, actualiza Node a v22+ o usa SKIP_CAP_SYNC=1"
  else
    echo "🔗 Sincronizando Capacitor (mobile shell)..."
    if ! CAPACITOR_APP_URL="$MOBILE_APP_URL" npm run cap:build:shell; then
      echo "⚠️ Falló sync de Capacitor, pero el deploy continuará para web/api/mobile"
    fi
  fi
fi

# 10. Reiniciar servicios con PM2
echo "🚀 Reiniciando servicios..."
cd "$PROJECT_DIR"
start_or_restart_pm2 "nexara-api" apps/api/dist/main.js
echo "♻️ Recreando nexara-web con configuración limpia..."
pm2 delete nexara-web >/dev/null 2>&1 || true
pm2 start npm --name nexara-web --cwd "$PROJECT_DIR/apps/web" -- start

echo "♻️ Recreando nexara-mobile con configuración limpia..."
pm2 delete nexara-mobile >/dev/null 2>&1 || true
pm2 start npm --name nexara-mobile --cwd "$PROJECT_DIR/apps/mobile" -- start -- --port "$MOBILE_PORT"

# Persistir procesos PM2 para reinicios del servidor
echo "💾 Guardando estado PM2..."
pm2 save

# 11. Verificar estado
echo "✅ Verificando servicios..."
pm2 list

echo "🔎 Verificando endpoints locales..."
if wait_for_endpoint "API" "http://127.0.0.1:${API_PORT}/api/health" "$HEALTHCHECK_RETRIES" "$HEALTHCHECK_DELAY" "$HEALTHCHECK_TIMEOUT"; then
  echo "✅ API OK en :${API_PORT}"
else
  echo "⚠️ API no respondió en :${API_PORT}"
fi

if wait_for_endpoint "WEB" "http://127.0.0.1:${WEB_PORT}" "$HEALTHCHECK_RETRIES" "$HEALTHCHECK_DELAY" "$HEALTHCHECK_TIMEOUT"; then
  echo "✅ WEB OK en :${WEB_PORT}"
else
  echo "⚠️ WEB no respondió en :${WEB_PORT}"
fi

if wait_for_endpoint "MOBILE" "http://127.0.0.1:${MOBILE_PORT}" "$HEALTHCHECK_RETRIES" "$HEALTHCHECK_DELAY" "$HEALTHCHECK_TIMEOUT"; then
  echo "✅ MOBILE OK en :${MOBILE_PORT}"
else
  echo "⚠️ MOBILE no respondió en :${MOBILE_PORT}"
fi

echo ""
echo "🎉 ¡Actualización completada!"
echo ""
echo "📊 Comandos útiles:"
echo "  pm2 logs nexara-api    # Ver logs del backend"
echo "  pm2 logs nexara-web    # Ver logs del frontend"
echo "  pm2 logs nexara-mobile # Ver logs del frontend mobile"
echo "  pm2 monit             # Monitor en tiempo real"
