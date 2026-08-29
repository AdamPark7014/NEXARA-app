# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-29
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Integra multi-cliente hiper-particionado
- **Portfolio** `GET /integra/portfolio`: super-admin ve todas las empresas/sitios; tenant solo la suya. Caps + lista de módulos por inventario.
- **Capabilities** por espejo (cams→video, puertas→ACS, vehículos→ANPR/flota). `canSettings=false` para rol `cliente`.
- **CLIENTE** puede abrir Integra (page-matrix + url-matrix) sin `/settings` ni mutaciones de sitios.
- **UI:** `_IntegraChrome` (contexto company/sitio + chips) en todo el panel; sidebar AppShell filtra por caps; home portfolio con CapPills; settings con override de módulos + companyId destino.
- **Artemis:** regions/personInfo/personInfoByCode; door control OPEN=`2`; sites list con `_count`.
- Migración `20260829200000_integra_regions_portfolio` (regiones + label/modulesOverride).

## A medias
- Credenciales Artemis reales en droplet (`INTEGRA_HIK_*` o sitios UI).
- go2rtc ↔ RTSP LAN por sitio.
- Deploy de esta oleada (cerrar → push main → update.sh).

## No tocar
- tickets layout, seed-demo-users, package-lock, xlsx credenciales

## Siguiente paso
1. Deploy + migrate en Hetzner.
2. Crear sitios Artemis por CompanyProfile cliente desde Sitios (companyId).
3. Sync → verificar módulos filtrados por tipo de dispositivo.
4. Probar login usuario `cliente` → solo su empresa, sin Sitios.

## Estado
- WIP salvado `77e2ca0`; este turno cierra el multi-cliente.
