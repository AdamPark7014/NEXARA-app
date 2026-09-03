/**
 * Instalador de la caja on-site (ADR-0021).
 *
 * Se sirve en `GET /api/integra/edge/install.sh` y se ejecuta una vez, en un
 * Debian/Ubuntu recién instalado:
 *
 *   curl -fsSL https://<api>/api/integra/edge/install.sh | sudo bash -s -- <token>
 *
 * No lleva secretos: el token va como argumento y solo lo tiene quien lo emitió
 * desde la consola. Todo lo demás lo negocia con `/edge/enroll`.
 *
 * Deja tres cosas corriendo: el túnel WireGuard, go2rtc para el video, y un
 * latido cada minuto para que la consola sepa que la sucursal está viva.
 */
export function edgeInstallScript(apiUrl: string): string {
  const api = (apiUrl || '').replace(/\/$/, '') || 'https://integra.nexara.com.mx';
  return `#!/usr/bin/env bash
# Caja on-site NEXARA Integra — instalador generado por la API.
# Uso: curl -fsSL ${api}/api/integra/edge/install.sh | sudo bash -s -- <token-de-alta>
set -Eeuo pipefail

API="\${NEXARA_API:-${api}}"
TOKEN="\${1:-}"
ETC=/etc/nexara-edge

if [[ -z "$TOKEN" ]]; then
  echo "Falta el token de alta. Emítelo en la consola: Sitios -> la caja -> Generar token." >&2
  exit 1
fi
if [[ $EUID -ne 0 ]]; then
  echo "Corre esto con sudo." >&2
  exit 1
fi

echo "==> Paquetes"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq wireguard-tools curl jq ca-certificates >/dev/null

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Docker (para go2rtc)"
  curl -fsSL https://get.docker.com | sh >/dev/null
fi

mkdir -p "$ETC"
chmod 700 "$ETC"

echo "==> Claves WireGuard"
# Se generan aquí y la privada nunca sale de esta máquina: al servidor solo
# viaja la pública. Si la caja se pierde, se revoca desde la consola.
if [[ ! -f "$ETC/wg.key" ]]; then
  (umask 077; wg genkey > "$ETC/wg.key")
fi
PRIV=$(cat "$ETC/wg.key")
PUB=$(printf '%s' "$PRIV" | wg pubkey)

echo "==> Alta contra $API"
RESP=$(curl -fsS -X POST "$API/api/integra/edge/enroll" \\
  -H 'Content-Type: application/json' \\
  -d "$(jq -nc --arg t "$TOKEN" --arg k "$PUB" --arg h "$(hostname)" \\
        '{token:$t, publicKey:$k, hostname:$h, agentVersion:"1.0.0"}')") || {
  echo "El alta falló. Token inválido, expirado o ya usado." >&2
  exit 1
}

SITE_ID=$(jq -r '.siteId' <<<"$RESP")
SITE_NAME=$(jq -r '.siteName' <<<"$RESP")
TUNNEL_IP=$(jq -r '.tunnelIp' <<<"$RESP")
SRV_PUB=$(jq -r '.serverPublicKey' <<<"$RESP")
ENDPOINT=$(jq -r '.serverEndpoint' <<<"$RESP")
ALLOWED=$(jq -r '.allowedIps' <<<"$RESP")
KEEPALIVE=$(jq -r '.keepalive' <<<"$RESP")
AGENT_TOKEN=$(jq -r '.agentToken' <<<"$RESP")

echo "    sitio #$SITE_ID ($SITE_NAME) -> $TUNNEL_IP"

(umask 077; cat > "$ETC/agent.env" <<EOF
NEXARA_API=$API
EDGE_TOKEN=$AGENT_TOKEN
SITE_ID=$SITE_ID
TUNNEL_IP=$TUNNEL_IP
EOF
)

echo "==> Túnel"
(umask 077; cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address    = $TUNNEL_IP/32
PrivateKey = $PRIV

[Peer]
PublicKey  = $SRV_PUB
Endpoint   = $ENDPOINT
AllowedIPs = $ALLOWED
# Imprescindible detrás de NAT: mantiene viva la traducción del router del
# cliente. Sin esto el túnel se cae en silencio a los pocos minutos.
PersistentKeepalive = $KEEPALIVE
EOF
)
systemctl enable --now wg-quick@wg0 >/dev/null 2>&1 || systemctl restart wg-quick@wg0

echo "==> go2rtc"
# El video se remuxa aquí: por el túnel solo viaja el canal que alguien está
# viendo, no el RTSP crudo de las 13 cámaras.
docker rm -f nexara-go2rtc >/dev/null 2>&1 || true
docker run -d --name nexara-go2rtc --restart unless-stopped \\
  --network host alexxit/go2rtc:1.9.7 >/dev/null

echo "==> Latido"
cat > /usr/local/bin/nexara-edge-heartbeat <<'EOF'
#!/usr/bin/env bash
set -uo pipefail
source /etc/nexara-edge/agent.env
ERR=""
# Un túnel arriba sin handshake reciente es la avería silenciosa típica.
HANDSHAKE=$(wg show wg0 latest-handshakes 2>/dev/null | awk '{print $2}' | head -1)
NOW=$(date +%s)
if [[ -z "\${HANDSHAKE:-}" || "$HANDSHAKE" == "0" ]]; then
  ERR="sin handshake WireGuard"
elif (( NOW - HANDSHAKE > 180 )); then
  ERR="handshake WireGuard hace $(( NOW - HANDSHAKE ))s"
fi
if ! docker ps --format '{{.Names}}' | grep -q '^nexara-go2rtc$'; then
  ERR="\${ERR:+$ERR; }go2rtc caído"
fi
curl -fsS -m 15 -X POST "$NEXARA_API/api/integra/edge/heartbeat" \\
  -H "x-edge-token: $EDGE_TOKEN" -H 'Content-Type: application/json' \\
  -d "{\\"agentVersion\\":\\"1.0.0\\",\\"error\\":\\"\${ERR}\\"}" >/dev/null || true
EOF
chmod +x /usr/local/bin/nexara-edge-heartbeat

cat > /etc/systemd/system/nexara-edge-heartbeat.service <<'EOF'
[Unit]
Description=Latido de la caja NEXARA Integra
After=network-online.target wg-quick@wg0.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/nexara-edge-heartbeat
EOF

cat > /etc/systemd/system/nexara-edge-heartbeat.timer <<'EOF'
[Unit]
Description=Latido de la caja NEXARA Integra cada minuto

[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
AccuracySec=5s

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now nexara-edge-heartbeat.timer >/dev/null

echo
echo "Listo. Sitio #$SITE_ID ($SITE_NAME) en $TUNNEL_IP."
echo "Comprobar:  wg show wg0  ·  systemctl status nexara-edge-heartbeat.timer"
echo "La consola debería marcar la caja en línea en menos de un minuto."
`;
}
