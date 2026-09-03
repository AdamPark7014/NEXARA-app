#!/usr/bin/env bash
# Aplica en WireGuard los peers que la API tiene declarados (ADR-0021).
#
#   sudo bash deploy/edge/wg-reconcile.sh --install <token>   # timer cada minuto
#   sudo bash deploy/edge/wg-reconcile.sh                     # una pasada
#
# Por qué existe: la API corre en un contenedor y no tiene por qué ser root en
# el anfitrión. Declara el peer en la base; esto lo aplica con `wg set`. Si el
# reconciliador se cae, el túnel de las cajas ya enroladas sigue funcionando —
# solo dejan de darse de alta las nuevas.
set -Eeuo pipefail

ETC=/etc/nexara-edge-reconcile
IFACE=wg0

install_timer() {
  local token="$1"
  [[ -z "$token" ]] && { echo "Falta el token del reconciliador." >&2; exit 1; }
  mkdir -p "$ETC"; chmod 700 "$ETC"
  (umask 077; cat > "$ETC/env" <<EOF
RECONCILE_TOKEN=${token}
API_URL=${API_URL:-http://127.0.0.1:3001}
EOF
  )
  install -m 755 "$0" /usr/local/bin/nexara-wg-reconcile

  cat > /etc/systemd/system/nexara-wg-reconcile.service <<'EOF'
[Unit]
Description=Reconcilia peers WireGuard de las cajas NEXARA Integra
After=network-online.target wg-quick@wg0.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/nexara-wg-reconcile
EOF

  cat > /etc/systemd/system/nexara-wg-reconcile.timer <<'EOF'
[Unit]
Description=Reconcilia peers de las cajas cada minuto

[Timer]
OnBootSec=45s
OnUnitActiveSec=60s
AccuracySec=10s

[Install]
WantedBy=timers.target
EOF

  systemctl daemon-reload
  systemctl enable --now nexara-wg-reconcile.timer
  echo "Reconciliador instalado. Estado: systemctl status nexara-wg-reconcile.timer"
}

if [[ "${1:-}" == "--install" ]]; then
  install_timer "${2:-}"
  exit 0
fi

# shellcheck disable=SC1091
source "$ETC/env"

RESP=$(curl -fsS -m 20 "${API_URL}/api/integra/edge/peers" \
  -H "x-reconcile-token: ${RECONCILE_TOKEN}") || {
  echo "No se pudo leer los peers de la API" >&2
  exit 1
}

# Peers que la API declara.
declare -A WANTED
while IFS=$'\t' read -r pub allowed; do
  [[ -z "$pub" ]] && continue
  WANTED["$pub"]="$allowed"
done < <(jq -r '.peers[] | "\(.publicKey)\t\(.allowedIps)"' <<<"$RESP")

# Altas y cambios de IP.
for pub in "${!WANTED[@]}"; do
  current=$(wg show "$IFACE" allowed-ips 2>/dev/null | awk -v k="$pub" '$1==k {print $2}')
  if [[ "$current" != "${WANTED[$pub]}" ]]; then
    wg set "$IFACE" peer "$pub" allowed-ips "${WANTED[$pub]}"
    echo "peer $pub -> ${WANTED[$pub]}"
  fi
done

# Bajas: lo que está en la interfaz y la API ya no declara (sitio revocado).
while read -r pub _; do
  [[ -z "$pub" ]] && continue
  if [[ -z "${WANTED[$pub]:-}" ]]; then
    wg set "$IFACE" peer "$pub" remove
    echo "peer $pub retirado"
  fi
done < <(wg show "$IFACE" allowed-ips 2>/dev/null)

# Persistir para que sobreviva a un reinicio de la interfaz.
wg-quick save "$IFACE" 2>/dev/null || true
