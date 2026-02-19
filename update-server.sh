#!/bin/bash

# 🚀 Script para actualizar NEXARA-app en Digital Ocean
# Ejecutar estos comandos EN EL SERVIDOR después de conectarte con SSH

set -e

echo "🔄 Actualizando NEXARA-app desde GitHub..."

# 1. Ir al directorio del proyecto
cd /var/www/nexara-app

# 2. Hacer backup rápido de .env
echo "💾 Haciendo backup de archivos .env..."
cp apps/api/.env apps/api/.env.backup || true
cp apps/web/.env.local apps/web/.env.local.backup || true

# 3. Detener servicios temporalmente
echo "⏸️ Deteniendo servicios..."
pm2 stop nexara-api || true
pm2 stop nexara-web || true

# 4. Actualizar código desde GitHub
echo "📥 Descargando últimos cambios..."
git fetch origin main
git reset --hard origin/main
git clean -fd

# 5. Restaurar archivos .env
echo "📂 Restaurando archivos .env..."
cp apps/api/.env.backup apps/api/.env || true
cp apps/web/.env.local.backup apps/web/.env.local || true

# 6. Actualizar Backend (API)
echo "🔧 Actualizando Backend..."
cd apps/api
npm install --legacy-peer-deps
npx prisma generate
npx prisma migrate deploy
npm run build

# 7. Actualizar Frontend (Web)
echo "🎨 Actualizando Frontend..."
cd ../web
rm -rf .next node_modules package-lock.json
npm install --legacy-peer-deps
npm run build

# 8. Reiniciar servicios con PM2
echo "🚀 Reiniciando servicios..."
cd /var/www/nexara-app
pm2 restart nexara-api || pm2 start apps/api/dist/main.js --name nexara-api
pm2 restart nexara-web || pm2 start npm --name nexara-web -- start --prefix apps/web

# 9. Verificar estado
echo "✅ Verificando servicios..."
pm2 list

echo ""
echo "🎉 ¡Actualización completada!"
echo ""
echo "📊 Comandos útiles:"
echo "  pm2 logs nexara-api    # Ver logs del backend"
echo "  pm2 logs nexara-web    # Ver logs del frontend"
echo "  pm2 monit             # Monitor en tiempo real"
