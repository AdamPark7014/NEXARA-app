#!/bin/bash
set -euo pipefail
cd /var/www/nexara-app

echo "=== AUDIT recent person ops ==="
docker compose --env-file deploy/.env.nexara -f deploy/docker-compose.nexara.yml exec -T db \
  psql -U nexara_user -d nexara_db -c \
  "SELECT id, action, \"createdAt\", left(meta::text, 500) AS meta FROM audit_logs WHERE action LIKE '%person%' ORDER BY id DESC LIMIT 25;"

echo "=== Ariadna row ==="
docker compose --env-file deploy/.env.nexara -f deploy/docker-compose.nexara.yml exec -T db \
  psql -U nexara_user -d nexara_db -c \
  "SELECT id, \"personId\", \"personName\", raw::text FROM integra_people WHERE \"personId\"='2632768193';"

EMP=2632768193
IPS="192.168.9.160 192.168.9.161 192.168.9.162 192.168.9.163 192.168.9.155"

# Pull ACS creds from site raw / env inside api container
echo "=== Probe UserInfo Search per IP for $EMP ==="
docker compose --env-file deploy/.env.nexara -f deploy/docker-compose.nexara.yml exec -T api \
  node -e '
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const site = await prisma.integraSite.findFirst({ where: { id: 1 } });
  const devices = await prisma.integraDevice.findMany({ where: { siteId: 1, kind: "ACS" }, select: { name: true, ip: true } });
  console.log("site.host", site?.host, "provider", site?.provider);
  console.log("devices", JSON.stringify(devices));
  // credentials live in site config
  const raw = site?.raw || {};
  console.log("site keys", Object.keys(site||{}));
  const cfg = await prisma.integraSite.findUnique({ where: { id: 1 } });
  console.log(JSON.stringify({ username: cfg?.username, hasPass: !!(cfg?.passwordEncrypted||cfg?.password), host: cfg?.host }, null, 2));
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
'
