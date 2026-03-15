#!/bin/bash

# 🚀 Script de Deploy Automatizado para NEXARA-app en Digital Ocean
# Ejecutar: bash deploy.sh

set -e  # Detener si hay error

# Forzar builds en serie durante deploy.
BUILD_MODE="serial"

run_build_serial() {
    local target="$1"
    shift
    echo -e "${YELLOW}🧱 Compilando ${target} en serie (${BUILD_MODE})...${NC}"
    "$@"
}

echo "🚀 Iniciando deploy de NEXARA-app..."

# Variables
PROJECT_DIR="/var/www/nexara-app"
REPO_URL="https://github.com/AdamPark7014/NEXARA-app.git"

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}📦 Verificando instalación de dependencias...${NC}"

# Verificar si Node.js está instalado
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js no está instalado. Instalando...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Verificar si Git está instalado
if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ Git no está instalado. Instalando...${NC}"
    apt-get update
    apt-get install -y git
fi

# Verificar si PM2 está instalado
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}📦 Instalando PM2...${NC}"
    npm install -g pm2
fi

# Verificar si PostgreSQL está instalado
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}🗄️ PostgreSQL no detectado. ¿Deseas instalarlo? (s/n)${NC}"
    read -r install_pg
    if [[ $install_pg == "s" ]]; then
        apt-get update
        apt-get install -y postgresql postgresql-contrib
        systemctl start postgresql
        systemctl enable postgresql
        echo -e "${GREEN}✅ PostgreSQL instalado${NC}"
    fi
fi

echo -e "${GREEN}✅ Dependencias verificadas${NC}"

# Clonar o actualizar repositorio
if [ -d "$PROJECT_DIR" ]; then
    echo -e "${YELLOW}📁 Proyecto ya existe. Actualizando...${NC}"
    cd "$PROJECT_DIR"
    git pull origin main
else
    echo -e "${YELLOW}📥 Clonando repositorio...${NC}"
    mkdir -p /var/www
    cd /var/www
    git clone "$REPO_URL" nexara-app
    cd nexara-app
fi

echo -e "${GREEN}✅ Código actualizado${NC}"

# Backend
echo -e "${YELLOW}🔧 Configurando Backend (NestJS)...${NC}"
cd "$PROJECT_DIR/apps/api"

# Instalar dependencias
npm install

# Verificar si existe .env
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  No existe archivo .env para el backend${NC}"
    echo -e "${YELLOW}📝 Creando .env desde .env.example...${NC}"
    cp .env.example .env
    echo -e "${RED}⚠️  IMPORTANTE: Edita apps/api/.env con tus credenciales de base de datos${NC}"
    echo -e "${RED}   DATABASE_URL=\"postgresql://usuario:password@localhost:5432/nexara_db?schema=public\"${NC}"
    echo -e "${YELLOW}¿Deseas editar el archivo ahora? (s/n)${NC}"
    read -r edit_env
    if [[ $edit_env == "s" ]]; then
        nano .env
    fi
fi

# Ejecutar migraciones de Prisma
echo -e "${YELLOW}🗄️ Ejecutando migraciones de Prisma...${NC}"
npx prisma generate
npx prisma migrate deploy

# Preguntar si ejecutar seed
echo -e "${YELLOW}¿Deseas ejecutar el seed de la base de datos? (s/n)${NC}"
read -r run_seed
if [[ $run_seed == "s" ]]; then
    node prisma/seed.js
fi

# Compilar backend
echo -e "${YELLOW}📦 Compilando backend...${NC}"
run_build_serial "backend" npm run build

# Iniciar/reiniciar backend con PM2
if pm2 list | grep -q "nexara-api"; then
    echo -e "${YELLOW}🔄 Reiniciando backend...${NC}"
    pm2 restart nexara-api --update-env
else
    echo -e "${YELLOW}🚀 Iniciando backend...${NC}"
    pm2 start dist/main.js --name nexara-api
fi

echo -e "${GREEN}✅ Backend configurado y corriendo${NC}"

# Frontend
echo -e "${YELLOW}🎨 Configurando Frontend (Next.js)...${NC}"
cd "$PROJECT_DIR/apps/web"

# Instalar dependencias
npm install

# Verificar si existe .env.local
if [ ! -f .env.local ]; then
    echo -e "${YELLOW}⚠️  No existe archivo .env.local para el frontend${NC}"
    echo -e "${YELLOW}📝 Creando .env.local...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env.local
    else
        echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > .env.local
        echo "NEXT_PUBLIC_BASE_URL=http://localhost:3000" >> .env.local
    fi
    echo -e "${RED}⚠️  IMPORTANTE: Edita apps/web/.env.local con la URL de tu servidor${NC}"
    echo -e "${YELLOW}¿Deseas editar el archivo ahora? (s/n)${NC}"
    read -r edit_env_web
    if [[ $edit_env_web == "s" ]]; then
        nano .env.local
    fi
fi

# Compilar frontend
echo -e "${YELLOW}📦 Compilando frontend (esto puede tardar unos minutos)...${NC}"
# Evitar artefactos stale de Next que pueden romper Server Actions tras deploy
rm -rf .next
run_build_serial "frontend" npm run build

# Iniciar/reiniciar frontend con PM2
if pm2 list | grep -q "nexara-web"; then
    echo -e "${YELLOW}🔄 Reiniciando frontend...${NC}"
    pm2 restart nexara-web --update-env
else
    echo -e "${YELLOW}🚀 Iniciando frontend...${NC}"
    pm2 start npm --name nexara-web -- start
fi

echo -e "${GREEN}✅ Frontend configurado y corriendo${NC}"

# Guardar configuración PM2
pm2 save

# Verificar si PM2 startup está configurado
if ! systemctl is-enabled pm2-root &> /dev/null; then
    echo -e "${YELLOW}⚙️  Configurando PM2 para iniciar al arrancar el sistema...${NC}"
    pm2 startup
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}✅ Deploy completado exitosamente!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "📊 Estado de servicios:"
pm2 list
echo ""
echo -e "🌐 URLs de acceso (ajusta según tu configuración):"
echo -e "   Backend API: http://138.197.42.104:3001"
echo -e "   Frontend Web: http://138.197.42.104:3000"
echo ""
echo -e "📝 Comandos útiles:"
echo -e "   Ver logs backend: ${YELLOW}pm2 logs nexara-api${NC}"
echo -e "   Ver logs frontend: ${YELLOW}pm2 logs nexara-web${NC}"
echo -e "   Reiniciar todo: ${YELLOW}pm2 restart all${NC}"
echo -e "   Monitor: ${YELLOW}pm2 monit${NC}"
echo ""
echo -e "${YELLOW}⚠️  Si configuraste Nginx, no olvides reiniciarlo:${NC}"
echo -e "   ${YELLOW}nginx -t && systemctl restart nginx${NC}"
echo ""
