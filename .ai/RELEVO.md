# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-29
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Plan Integra Artemis P0→P1 — implementado

**Cliente compartido** `apps/api/src/hikvision-artemis/`:
HMAC, rate limit, cameras/preview/doors/events/people/orgs/privilege/vehicles.
8 tests (firma + 503/502 + offset ISO). Oficinas e Integra lo consumen por separado.

**API Integra** `apps/api/src/integra/`:
`/api/integra/health|cameras|preview|doors|open|events|orgs|people|privilege-groups|vehicles`.
Env `INTEGRA_HIK_*`. RBAC CEO/dir_ops/coord_ops/ing_soporte.

**UI Integra** (ya no stubs P0): home, video (RTSP copy), access (+ privilegios),
events, people (alta/baja), vehicles (lista).

**Oficinas**: refactor a cliente compartido; compose local con `INTEGRA_HIK_*`.

**Ops**: `docs/INTEGRA-OPS.md` (DNS, secrets, smoke).

## A medias — CUIDADO
- DNS `integra.nexara.com.mx` + secretos en droplet **aún no** (ops humano).
- Player HTML5 / media gateway: fuera de alcance (solo RTSP URL).
- Espejo Prisma inventarios / sync: P2.
- A1 Playwright / observabilidad / seed Claudia: intactos.

## No tocar
- `apps/web/app/(subdomains)/tickets/layout.tsx`
- `NEXARA-credenciales-usuarios-v4.xlsx`
- `apps/api/prisma/seed-demo-users.ts`
- `package-lock.json`

## Siguiente paso
1. DNS + `OFFICES_HIK_*` / `INTEGRA_HIK_*` en producción y smoke health.
2. P2: sync local + media gateway si se quiere live in-browser.
3. Decisión seed usuarios (turno 28-ago).

## Estado verificado al cerrar
- Jest hikvision-artemis: **8/8** OK.
- `tsc` api + web: limpio.
