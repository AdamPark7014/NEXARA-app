#!/usr/bin/env bash
# Prepara el lado servidor del enlace con las cajas on-site (ADR-0021).
# Se corre UNA vez en el anfitrión. Idempotente.
#
#   sudo bash deploy/edge/server-setup.sh
#
# Deja WireGuard escuchando y te imprime las variables que hay que pegar en
# deploy/.env.nexara. No toca ningún contenedor.
set -Eeuo pipefail

SUBNET="${INTEGRA_EDGE_WG_SUBNET:-10.77.0.0/24}"
PORT="${INTEGRA_EDGE_WG_PORT:-51820}"
SERVER_IP="${SUBNET%.*}.1"

if [[ $EUID -ne 0 ]]; then
  echo "Corre esto con sudo." >&2
  exit 1
fi

echo "==> WireGuard"
if ! command -v wg >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq && apt-get install -y -qq wireguard >/dev/null
fi

mkdir -p /etc/wireguard
chmod 700 /etc/wireguard

if [[ ! -f /etc/wireguard/server.key ]]; then
  echo "==> Claves del servidor"
  (umask 077; wg genkey > /etc/wireguard/server.key)
  wg pubkey < /etc/wireguard/server.key > /etc/wireguard/server.pub
fi
SRV_PRIV=$(cat /etc/wireguard/server.key)
SRV_PUB=$(cat /etc/wireguard/server.pub)

if [[ ! -f /etc/wireguard/wg0.conf ]]; then
  echo "==> wg0.conf"
  # Sin peers: los mete el reconciliador desde la base. Editar este archivo a
  # mano es exactamente lo que este diseño viene a evitar.
  (umask 077; cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address    = ${SERVER_IP}/24
ListenPort = ${PORT}
PrivateKey = ${SRV_PRIV}
# Los peers los administra deploy/edge/wg-reconcile.sh — no editar a mano.
EOF
  )
fi

systemctl enable --now wg-quick@wg0 >/dev/null 2>&1 || systemctl restart wg-quick@wg0

RECONCILE_TOKEN=$(openssl rand -base64 32 | tr -d '\n')
PUBLIC_IP=$(curl -fsS -m 8 https://api.ipify.org 2>/dev/null || echo '<IP-PUBLICA>')

cat <<EOF

======================================================================
WireGuard escuchando en ${PORT}/udp · servidor ${SERVER_IP}

1) Abre ${PORT}/udp en el firewall de Hetzner (es el único puerto nuevo,
   y es UDP: no responde a escaneos TCP).

2) Pega esto en deploy/.env.nexara y redespliega la API:

INTEGRA_EDGE_WG_ENDPOINT=${PUBLIC_IP}:${PORT}
INTEGRA_EDGE_WG_SERVER_PUBKEY=${SRV_PUB}
INTEGRA_EDGE_WG_SUBNET=${SUBNET}
INTEGRA_EDGE_API_URL=https://integra.nexara.com.mx
INTEGRA_EDGE_RECONCILE_TOKEN=${RECONCILE_TOKEN}

3) Instala el reconciliador con ese mismo token:

   sudo bash deploy/edge/wg-reconcile.sh --install ${RECONCILE_TOKEN}
======================================================================
EOF
