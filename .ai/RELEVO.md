# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-29
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Integra multi-cliente hiper-particionado — desplegado
- Portfolio / capabilities / CLIENTE RBAC / IntegraChrome / sidebar por caps / settings override.
- Deploy Hetzner OK: `nexara-api` + `nexara-web` recreados; migrate applied (regiones + label/modulesOverride presentes).
- Smoke: https://integra.nexara.com.mx/ → 200 login; `/api/integra/portfolio` → 401 sin auth (esperado).

## A medias
- Credenciales Artemis reales (`INTEGRA_HIK_*` o Sitios UI) — sin sync el portfolio está vacío.
- go2rtc ↔ RTSP LAN.

## No tocar
- tickets layout, seed-demo-users, package-lock, xlsx credenciales

## Siguiente paso
1. Login staff en https://integra.nexara.com.mx/
2. Sitios → crear Artemis por CompanyId cliente → Sync
3. Verificar módulos filtrados; probar usuario `cliente`

## Estado
- Commit `e8d917a` en main + prod.
