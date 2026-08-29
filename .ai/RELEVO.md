# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-29
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### ADR-0017 · NEXARA Integra + ACS oficinas
Decisión de Adam: panel `integra` con **HikCentral Professional Artemis**
debajo (máxima paridad CCTV/ACS); sin pitch comercial. `access-control` queda
como ACS de **oficinas NEXARA**, no como superficie del producto Integra.

### ACS oficinas — Artemis real
- Nuevo `hikcentral-artemis.client.ts` (HMAC-SHA256 = plantilla python del taller).
- 4 tests de firma en verde.
- `hikvision-api.service.ts` ya no inventa `/api/v1/...` + Bearer.
- Env: `OFFICES_HIK_HOST` / `APP_KEY` / `APP_SECRET` (+ fallback `HIKVISION_URL`, `HIK_APP_*`).
- UI: `/erp/facilities/access` (listar puertas, abrir, eventos 24h, health).
- `POST/DELETE /rules` → 501 hasta modelar `privilege/group`.

### Panel Integra (6º host)
- `integra.nexara.com.mx` → `/integra` (middleware, Traefik, subdomain-config).
- `access-matrix` / `page-matrix` / `url-matrix` / handoff / CommandPalette.
- Shell + stubs: video, access, people, events, vehicles.
- Env producto: `INTEGRA_HIK_*` (aún sin módulo API dedicado; siguiente fase).

### Docs
- `docs/ADR-0017-nexara-integra.md`
- `ARQUITECTURA_V2` fila integra; `DEUDA-TECNICA` apunta ACS oficinas + Integra.

## A medias — CUIDADO
- **Módulos Integra** (video/live, privilege groups, vehículos): solo stubs UI.
  Falta `apps/api/src/integra/` con cliente Artemis de producto (`INTEGRA_HIK_*`).
- **DNS + cert** `integra.nexara.com.mx` en producción: Traefik listo; hay que
  crear el registro y dejar que Let’s Encrypt emita.
- **Credenciales Artemis de oficinas** aún no cargadas en el droplet — health
  devolverá `Sin config` hasta poner `OFFICES_HIK_*`.
- Los cinco puntos A1 del turno 2026-08-27 (Playwright, observabilidad, runbooks,
  native-parity, deuda NOC/PAC/SCIM) **siguen sin empezar**.

## No tocar
- `apps/web/app/(subdomains)/tickets/layout.tsx`
- `NEXARA-credenciales-usuarios-v4.xlsx`
- `apps/api/prisma/seed-demo-users.ts` (contraseñas en claro; decisión Adam pendiente)
- `package-lock.json` (ruido npm 11)

## Siguiente paso
1. Alta DNS `integra` + cargar `OFFICES_HIK_*` contra el HikCentral de oficinas.
2. API `integra/` (versión, cámaras, previewURLs, puertas sitio) reusando el
   cliente Artemis — **no** mezclar con `/api/access-control`.
3. Decidir seed Claudia/Ariadna/Isaías (riesgo abierto del turno anterior).

## Estado verificado al cerrar
- Jest Artemis firma: **4/4** OK.
- `tsc --noEmit` api y web: limpio.
- Árbol con cambios de este turno **sin commit** (Adam no pidió commit).
