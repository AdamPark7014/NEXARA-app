#!/usr/bin/env bash
# Detiene procesos típicos "sin Docker" que duplican la API/web/mobile detrás de Traefik
# (mismo dominio → dos backends). Idempotente: si no hay nada, no hace daño.
set -Eeuo pipefail

echo "[nexara] Limpiando runtime legacy en el host (antes de Docker)..."

if command -v pm2 >/dev/null 2>&1; then
  # Nombres habituales en despliegues antiguos; borrar del proceso PM2, no del disco.
  for name in nexara-api nexara-web nexara-mobile nexara-app-api nexara-app-web nexara-app-mobile api web mobile; do
    if pm2 describe "$name" >/dev/null 2>&1; then
      echo "[nexara] PM2: deteniendo y eliminando '$name'"
      pm2 stop "$name" >/dev/null 2>&1 || true
      pm2 delete "$name" >/dev/null 2>&1 || true
    fi
  done
  # Si quedó un ecosystem vacío, guardar estado (no falla si no hay nada)
  pm2 save >/dev/null 2>&1 || true
fi

# Unidades systemd opcionales (si existían antes de migrar a Docker)
if command -v systemctl >/dev/null 2>&1; then
  for unit in nexara-api.service nexara-web.service nexara-mobile.service nexara-app.service; do
    if systemctl cat "$unit" >/dev/null 2>&1; then
      echo "[nexara] systemd: deteniendo/deshabilitando $unit (si aplica)"
      systemctl stop "$unit" 2>/dev/null || true
      systemctl disable "$unit" 2>/dev/null || true
    fi
  done
fi

echo "[nexara] Listo: no debería quedar Node/PM2 escuchando los mismos roles que los contenedores."
