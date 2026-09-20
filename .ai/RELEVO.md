# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** mejora/calidad-y-web
- **HEAD:** (pendiente cerrar) — open points 1/2/4; **no** toca cotizaciones de prueba

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

Adam: cerrar todos los puntos abiertos excepto las 12 cotizaciones de prueba.

### 1) Enlaces CRM/OPS → ya no van a subdominios muertos
- `CORE_SURFACE_ONLY`: `buildCrossPanelUrl` remapea con `coreSurfaceRedirect` y **nunca** salta a sales/ops.
- CRM ola1: `/crm/quotes|clients|projects` → `/erp/cotizaciones|clientes|proyectos` (con id).
- Specs: handoff + legacy-path-remap en verde.

### 2) Catálogo de cuentas base (~80)
- `apps/api/src/accounting/base-chart-of-accounts.ts`
- `POST /accounting/accounts/seed-base` (solo crea faltantes)
- Botón «Cargar catálogo base» en pólizas/tab cuentas
- Hub arranque: copy actualizado
- `209.01` sigue siendo IVA acreditable (asientos auto); IVA por pagar = `216.01`

### 4) Build no silencia tipos
- `scripts/next-build-resilient.js`: reintento **solo OOM 137** con más heap; type-check ON. Fallo de tipos → exit del primer intento.

### Excluido (pedido Adam)
- Punto 3: no borrar las 12 cotizaciones de prueba en prod.

## A medias

- Deploy de este turno (push + force-all) tras cerrar.
- Módulos CRM fuera de ola1 (leads, pipeline…) siguen cayendo a pizarra en Core-only — no tienen home /erp aún.

## Siguiente

1. Deploy Hetzner.
2. Smoke: link CRM/OPS desde Contabilidad/ERP; seed catálogo; build sin IGNORE_TYPE_ERRORS.

## No tocar

Puente NAS · cotizaciones de prueba (punto 3).
