#!/bin/bash

# ==============================================================================
# Script de Migración: De /panel/* a Subdominios
# ==============================================================================
# 
# Este script ayuda a copiar contenido desde la estructura antigua (/panel/*)
# a la nueva estructura de subdominios (__subdomains/[slug]/*)
#
# Uso: bash migrate-to-subdomains.sh console ventas web
# ==============================================================================

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Directorio base
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_APP_DIR="$BASE_DIR/apps/web/app"

# Mapeo de panels a migrar
declare -A PANELS=(
    [console]="console"
    [ventas]="ventas"
    [web]="web"
    [contabilidad]="contabilidad"
    [tickets]="tickets"
    [ingenieros]="ingenieros"
    [dashboard]="dashboard"
)

echo -e "${YELLOW}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║    Script de Migración a Subdominios              ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════════╝${NC}"
echo ""

if [ $# -eq 0 ]; then
    echo -e "${YELLOW}Uso:${NC} $0 [panel1] [panel2] ..."
    echo ""
    echo -e "${YELLOW}Paneles disponibles:${NC}"
    for panel in "${!PANELS[@]}"; do
        echo "  - $panel"
    done
    echo ""
    echo -e "${YELLOW}Ejemplos:${NC}"
    echo "  $0 console          # Migra solo console"
    echo "  $0 console ventas   # Migra console y ventas"
    echo "  $0 all              # Migra todos los paneles"
    exit 0
fi

# Función para migrar un panel
migrate_panel() {
    local panel=$1
    local slug=${PANELS[$panel]}
    
    if [ -z "$slug" ]; then
        echo -e "${RED}✗ Panel no reconocido: $panel${NC}"
        return 1
    fi

    local source_dir="$WEB_APP_DIR/panel/$panel"
    local target_dir="$WEB_APP_DIR/__subdomains/[slug]/__panel-$panel-backup"

    echo -e "${YELLOW}→ Migrando: $panel${NC}"

    # Verificar que existe el directorio source
    if [ ! -d "$source_dir" ]; then
        echo -e "  ${RED}✗ Directorio no existe: $source_dir${NC}"
        return 1
    fi

    # Crear backup
    mkdir -p "$target_dir"
    cp -r "$source_dir"/* "$target_dir/" 2>/dev/null || true

    echo -e "  ${GREEN}✓ Contenido copiado a __subdomains/[slug]/__panel-$panel-backup/$${NC}"
    echo ""
}

# Procesar argumentos
if [ "$1" == "all" ]; then
    for panel in "${!PANELS[@]}"; do
        migrate_panel "$panel" || true
    done
else
    for panel in "$@"; do
        migrate_panel "$panel" || true
    done
fi

echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Migración completada                    ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Próximos pasos:${NC}"
echo "1. Revisar el contenido en: apps/web/app/__subdomains/[slug]/__panel-*-backup/"
echo "2. Copiar el contenido deseado a la estructura final"
echo "3. Actualizar imports y links (ver MIGRACION_SUBDOMINIOS.md)"
echo "4. Probar en desarrollo: consola.localhost:3000"
echo ""
