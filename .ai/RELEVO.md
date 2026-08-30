# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-29
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Integra Absolute Upgrade — cierre P2–P4
- **A1–A4 / B1–B3 / C** ya en disco (espejo Prisma, sync, audit, Artemis surface, go2rtc HLS, UI densa, NOC adapter, alarmas/visitas/ANPR).
- **P4 HCT (ADR-0019 Accepted):**
  - Cliente `hikvision-hct` + `IntegraSite.provider` (`ARTEMIS`|`HCT`) + migración.
  - resolveClient / health / openDoor / stream / sync espejo para HCT.
  - Settings UI selector provider; Video tolera token EZUIKit.
  - INTEGRA-OPS sección HCT; DTO create/update con `provider`.
- Tests: artemis, hct, media, portfolio, secrets OK; `tsc` API OK.

## A medias
- Player EZUIKit embebido en UI Video (hoy muestra JSON token HCT).
- Deploy prod: migrate `integra_site_provider` + hard-refresh.

## No tocar
- tickets layout, seed-demo-users, package-lock, xlsx credenciales
- Oficinas ACS (`/api/access-control` + `OFFICES_HIK_*`)

## Siguiente paso
1. `prisma migrate deploy` en droplet + restart api/web.
2. Smoke health/sync/stream Artemis; opcional site HCT de prueba.
3. (Opcional) EZUIKit player nativo en `/integra/video`.

## Estado
- Absolute Upgrade plan todos cerrados en código; listo para commit/deploy.
