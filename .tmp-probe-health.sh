#!/bin/bash
set -e
echo "=== containers ==="
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'nexara|NAMES' || true
echo "=== health ==="
docker exec nexara-api node -e 'fetch("http://127.0.0.1:3001/api/health").then(async r=>{const t=await r.text();console.log("STATUS",r.status);console.log(t.slice(0,800));}).catch(e=>console.error("ERR",e.message))'
echo "=== mem ==="
docker exec nexara-api node -e 'const fs=require("fs"); const s=fs.readFileSync("/proc/1/status","utf8"); const m=s.match(/VmRSS:\s+(\d+)/); console.log("VmRSS_MB", m?Math.round(+m[1]/1024):"?"); const {heapUsed}=process.memoryUsage();' 2>/dev/null || true
docker exec nexara-api sh -c 'node -p "JSON.stringify({pid:1})" >/dev/null; cat /proc/1/cmdline | tr "\0" " "; echo; ls -l /proc/1/exe'
# heap of PID 1 (node main)
docker exec nexara-api sh -c 'kill -0 1 && node --experimental-permission 2>/dev/null; true'
echo "=== NODE_OPTIONS ==="
docker exec nexara-api printenv NODE_OPTIONS || echo "(unset)"
echo "=== sites ==="
docker exec nexara-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id, \"companyId\", name, \"isActive\", \"isDefault\", provider FROM integra_sites ORDER BY id;"'
echo "=== memory_heap in last health via traefik? ==="
curl -sk https://api.nexara.com.mx/api/health 2>/dev/null | head -c 800 || curl -sk https://nexara.com.mx/api/health 2>/dev/null | head -c 800 || true
echo
