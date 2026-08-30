# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-08-30
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Login unificado (todos los paneles)

- `PanelLogin`: mismo card redondeado (24px) en core/ops/sales/integra/portal — sin skin “cuadrado” Integra.
- Copy de login sin proveedores (no HikCentral/Artemis en subtítulo público).
- Integra solo marca marca `NEXARA · Integra`; título/subtítulo genéricos.
- `subdomain-config` + tagline access-matrix sin naming de vendor.

## A medias
- (nada)

## No tocar
- tickets layout, seed-demo-users, package-lock, xlsx
- Oficinas ACS

## Siguiente paso
1. Hard-refresh en `integra.nexara.com.mx/login` y otro panel (p.ej. ops) — deben verse iguales.
2. Smoke Armor pendiente en UI autenticada (session extend / ticket / evidence).

## Estado
- Listo para cerrar + deploy web.
