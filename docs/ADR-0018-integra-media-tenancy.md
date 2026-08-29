# ADR-0018 · Integra media gateway + multi-tenant sites

## Status
Accepted — 2026-08-29

## Context
Integra P0–P1 era pass-through Artemis con un solo `INTEGRA_HIK_*` global y video = copiar RTSP.
Hace falta tenancy por `companyId`, bitácora ERP, y live in-browser sin WebPlugin Hikvision.

## Decision
1. **Prisma `IntegraSite`** por empresa: host + appKey/secret cifrados (AES-256-GCM, `INTEGRA_SECRETS_KEY` o `JWT_SECRET`). Fallback env `INTEGRA_HIK_*` si no hay filas.
2. **Espejo** `IntegraCamera|Door|Person|Device|Vehicle` + `IntegraSyncRun`; sync cron 15 min + manual.
3. **Media**: sidecar **go2rtc** (`nexara-go2rtc`). API registra RTSP Artemis y devuelve HLS público vía Traefik `https://integra.nexara.com.mx/go2rtc/...`. Player HTML5 + HLS.js.
4. Mutaciones Integra → `AuditService` (`source: integra`).
5. Oficinas ACS sin cambio (`OFFICES_HIK_*` / `/api/access-control`).

## Consequences
- Browser nunca habla HikCentral directo (ni pics ni RTSP).
- go2rtc debe alcanzar la LAN/VPN donde Artemis entrega RTSP.
- Rotación de keys de sitio = update `IntegraSite` (re-cifrar); rotar `INTEGRA_SECRETS_KEY` requiere re-encriptar todos los secrets.

## Refs
- ADR-0017, `docs/INTEGRA-OPS.md`, plan mejora absoluta.
