#!/bin/bash
set -eu
cd /var/www/nexara-app

echo "=== containers ==="
docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -i nexara

echo "=== go2rtc internal ==="
docker exec nexara-go2rtc wget -qO- http://127.0.0.1:1984/api 2>&1 | head -c 250; echo
echo "stream count:"
docker exec nexara-go2rtc wget -qO- http://127.0.0.1:1984/api/streams 2>&1 | tr ',' '\n' | grep -c '"producers"' || true

echo "=== go2rtc from api container ==="
docker exec nexara-api sh -c 'node -e "
fetch(process.env.GO2RTC_URL || \"http://nexara-go2rtc:1984\").then(r=>r.text()).then(t=>console.log(\"ok\",t.slice(0,120))).catch(e=>console.error(\"fail\",e.message))
"' 2>&1 || true
docker exec nexara-api printenv | grep -iE 'GO2RTC|PUBLIC|WEB_URL|API' | sed 's/=.*/=***/'

echo "=== traefik / public paths ==="
grep -Rni 'go2rtc\|1984\|hls' deploy/*.yml deploy/*.yaml 2>/dev/null | head -40 || true
ls deploy | head

echo "=== sample HLS probe via go2rtc ==="
# pick first stream name without dumping passwords
NAME=$(docker exec nexara-go2rtc wget -qO- http://127.0.0.1:1984/api/streams 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{const j=JSON.parse(s);console.log(Object.keys(j)[0]||'')}catch(e){console.log('')}})")
echo "first_stream=$NAME"
if [ -n "$NAME" ]; then
  docker exec nexara-go2rtc wget -qO- "http://127.0.0.1:1984/api/stream.m3u8?src=${NAME}" 2>&1 | head -c 400; echo
  docker exec nexara-go2rtc wget -qO- "http://127.0.0.1:1984/api/webrtc?src=${NAME}" 2>&1 | head -c 100; echo
fi

echo "=== integra health from api ==="
docker exec nexara-api sh -c 'node -e "
(async()=>{
  const bases=[\"http://127.0.0.1:3001\",\"http://nexara-api:3001\"];
  for (const b of bases){
    try{
      const r=await fetch(b+\"/api/health\");
      const t=await r.text();
      console.log(b,r.status,t.slice(0,500));
    }catch(e){console.log(b,\"ERR\",e.message)}
  }
})()
"'

echo "=== site row ==="
docker exec nexara-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id,name,provider,\"isActive\",\"isDefault\",host,\"lastHealthOkAt\",\"lastSyncAt\" FROM integra_sites;"'

echo "=== compose go2rtc labels ==="
grep -A40 'go2rtc' deploy/docker-compose.nexara.yml | head -50
