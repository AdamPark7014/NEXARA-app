#!/bin/bash
set -eu
cd /var/www/nexara-app
COMPOSE="docker compose --env-file deploy/.env.nexara -f deploy/docker-compose.nexara.yml"

echo "=== AUDIT ==="
$COMPOSE exec -T db psql -U nexara_user -d nexara_db -c "SELECT id, action, \"createdAt\", left(changes::text, 700) AS changes FROM audit_logs WHERE action ILIKE '%person%' OR changes::text ILIKE '%2632768193%' ORDER BY id DESC LIMIT 25;"

echo "=== RAW person ==="
$COMPOSE exec -T db psql -U nexara_user -d nexara_db -c "SELECT \"personId\", \"personName\", left(raw::text, 900) FROM integra_people WHERE \"personId\"='2632768193';"

echo "=== Write probe JS into api container ==="
$COMPOSE exec -T api sh -c 'cat > /tmp/probe-ariadna.js << "EOF"
const path = require("path");
const fs = require("fs");

function walk(dir, pred, out=[]) {
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p, pred, out);
      else if (pred(f, p)) out.push(p);
    } catch {}
  }
  return out;
}

(async () => {
  const distCandidates = ["/app/apps/api/dist", "/app/dist", "/usr/src/app/apps/api/dist", "/usr/src/app/dist"];
  const dist = distCandidates.find((d) => fs.existsSync(d));
  console.log("dist", dist, "cwd", process.cwd());
  console.log("ls /app", fs.existsSync("/app") ? fs.readdirSync("/app").slice(0,30) : "no");
  const prismaPaths = walk("/app", (f) => f === "prisma.service.js" || f === "index.js").slice(0, 20);
  console.log("sample js", prismaPaths.slice(0,10));

  // Prefer nest bootstrap via HTTP on localhost
  const http = require("http");
  function get(url) {
    return new Promise((resolve, reject) => {
      const req = http.get(url, (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => resolve({ status: res.statusCode, body: b }));
      });
      req.on("error", reject);
    });
  }
  for (const port of [3000, 4000, 8080]) {
    try {
      const r = await get("http://127.0.0.1:" + port + "/api/health");
      console.log("health", port, r.status, r.body.slice(0,120));
    } catch (e) {
      console.log("health", port, e.message);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
EOF
node /tmp/probe-ariadna.js'
