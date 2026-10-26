#!/usr/bin/env bash
# Muestra la carga del servidor cada ~10 s mientras corre una medición: load, CPU (us/sy/id/st),
# CPU y RAM del whisper de prueba, del API y de la web, y cuánto tarda el API público en responder.
ETI=$1; SEG=${2:-180}
OUT=/root/bench-whisper/resultados/carga-$ETI.log
: > "$OUT"
fin=$(( $(date +%s) + SEG ))
while [ "$(date +%s)" -lt "$fin" ]; do
  v=$(vmstat 5 2 | tail -1 | awk '{print "us="$13" sy="$14" id="$15" wa="$16" st="$17}')
  l=$(cut -d" " -f1 /proc/loadavg)
  s=$(docker stats --no-stream --format "{{.Name}}={{.CPUPerc}}/{{.MemUsage}}" bench-whisper nexara-api nexara-web 2>/dev/null | tr "\n" " ")
  h=$(curl -s -o /dev/null -m 10 -w "%{http_code}/%{time_total}s" https://api.nexara.com.mx/api/health/live)
  echo "$(date -u +%H:%M:%S) load=$l $v api=$h $s" >> "$OUT"
  sleep 3
done
