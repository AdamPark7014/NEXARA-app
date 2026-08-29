# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-29
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Plan Integra — mejora absoluta (P2–P4) — implementado

**A1 Prisma + sites:** `IntegraSite|Camera|Door|Person|Device|Vehicle|SyncRun` + migración
`20260829140000_integra_sites_mirror`. Secrets AES-GCM (`INTEGRA_SECRETS_KEY`).
`IntegraSiteService.resolveClient` (DB o env `INTEGRA_HIK_*`).

**A2 Sync:** `IntegraSyncService` cron `*/15` + `POST /api/integra/sync`. Listados leen espejo.

**A3 Audit:** mutaciones open/people/privilege/vehicle/visitor → `AuditService` (`source: integra`).

**A4 Artemis surface:** playbackURLs, capture, devices, event pictures, vehicle CRUD,
alarms/visitors/ANPR paths. Tests firma + secrets + media (12 passed).

**B1 go2rtc:** compose `nexara-go2rtc`, Traefik `/go2rtc`, `POST .../cameras/:id/stream` → HLS.
Player HTML5 + HLS.js CDN.

**B2 UX densa:** video live/playback/snapshot, access picker+devices, events+pics,
people detalle/orgs, vehicles CRUD, settings sitios, home KPIs+sync.

**B3 NOC:** `noc/adapters/integra.adapter.ts` — si hay espejo, no inventa CCTV/ACS.

**C/D:** UI alarms/visitors/ANPR; ADR-0018 media/tenancy; ADR-0019 HCT adapter (propuesto).
Ops actualizado `docs/INTEGRA-OPS.md`.

## A medias — CUIDADO
- DNS `integra.nexara.com.mx` + secretos droplet + migrate deploy **ops humano**.
- go2rtc debe alcanzar LAN/VPN del RTSP Artemis.
- Adapter HCT / ISAPI: solo ADR, sin código cliente aún.
- A1 Playwright / seed Claudia: intactos.

## No tocar
- `apps/web/app/(subdomains)/tickets/layout.tsx`
- `NEXARA-credenciales-usuarios-v4.xlsx`
- `apps/api/prisma/seed-demo-users.ts`
- `package-lock.json`

## Siguiente paso
1. Deploy: migrate + env `INTEGRA_SECRETS_KEY` / `GO2RTC_*` + smoke stream HLS.
2. Implementar cliente HCT cuando un sitio real lo pida (ADR-0019).
3. Observabilidad: alertas sync fallida en APM.

## Estado verificado al cerrar
- Jest integra + artemis surface: **12** OK.
- `tsc` api (`tsconfig.build.json`): limpio.
