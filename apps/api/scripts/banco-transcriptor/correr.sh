#!/usr/bin/env bash
# Levanta un whisper-server de prueba (misma imagen y banderas que producción) con un modelo,
# mide la junta y lo apaga. Uso: correr.sh <etiqueta> <modelo.bin|-> <hilos> <segundos> [cpus] [-- banderas de medir.py]
set -u
B=/root/bench-whisper
ETI=$1; MOD=$2; HILOS=$3; SEG=$4; shift 4
CPUS=""; if [ $# -gt 0 ] && [ "$1" != "--" ]; then CPUS=$1; shift; fi; [ "${1:-}" = "--" ] && shift
mkdir -p $B/resultados
docker rm -f bench-whisper >/dev/null 2>&1
if [ "$MOD" = "-" ]; then M=/models/modelo.bin; else M=/bench/$MOD; fi
LIM=""; [ -n "$CPUS" ] && LIM="--cpus $CPUS"
docker run -d --name bench-whisper $LIM --memory 3g -p 127.0.0.1:18080:8080 -v $B/modelos:/bench:ro nexara-transcriptor:latest \
  sh -c "exec whisper-server --host 0.0.0.0 --port 8080 -m $M -l es --convert -t $HILOS --vad -vm /models/ggml-silero-v6.2.0.bin ${EXTRA:-}" >/dev/null
for i in $(seq 1 120); do curl -s -o /dev/null http://127.0.0.1:18080/ && break; sleep 1; done
MEM=$(docker stats --no-stream --format "{{.MemUsage}}" bench-whisper)
echo "== $ETI ($MOD, $HILOS hilos, $SEG s, cpus=${CPUS:-todas}) memoria al cargar: $MEM"
python3 $B/medir.py "$ETI" http://127.0.0.1:18080/inference "$SEG" "$@"
docker stats --no-stream --format "memoria al final: {{.MemUsage}}" bench-whisper
docker rm -f bench-whisper >/dev/null 2>&1
