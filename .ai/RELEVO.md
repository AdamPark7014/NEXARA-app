# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Health heap + deploy estable

Prod `/api/health` daba 503 por `memory_heap` (umbral Terminus 300 MB).
Contenedor ~1.2 GiB RSS; umbral demasiado bajo bajo carga Integra.

### Qué hay

1. **Heap runtime** — `NODE_OPTIONS=--max-old-space-size=2048` en
   `Dockerfile.api` runner + `docker-compose.nexara.yml`.
2. **Health** — umbral `HEALTH_HEAP_LIMIT_MB` default **1536** (env).
3. **Sitio** — `resolveClient`: si `siteId` no pertenece al tenant, cae al
   sitio default activo (evita 404 por localStorage stale / company mismatch).
   Oficinas reales: `integra_sites.id=1` / `companyId=2`.
4. Pre-deploy: health ya 200 (heap bajo tras restart); falta aplicar env.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` · `bash deploy/update.sh --force-all`

### Verificar

1. `GET /api/health` → 200; `memory_heap` up.
2. `docker exec nexara-api printenv NODE_OPTIONS` → max-old-space-size=2048.
3. nexara-api / nexara-web Up.

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. Visitas recurrentes / Espacios / Horarios — validar UI en prod.
3. FieldDetection re-apply · employeeNumber↔personId.

## No tocar

Puente NAS, Traefik, credenciales. Face ID óptico inventado.
