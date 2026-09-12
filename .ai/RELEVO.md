# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — CommandPalette Core-only

### Hecho

- Acciones CRM/OPS/multi-panel sacadas a `CommandPalette.legacy-actions.ts` (código reciclable, no cableado en Core).
- Con `CORE_SURFACE_ONLY`: solo **Nuevo cliente**, tema, logout + módulos ola1. Sin lead/cotización/ticket ni “Ir a panel”.
- Entidades de búsqueda Core: solo `sales-client` / `activity`; URLs vía `/erp/clientes` y `/erp/pizarra`.
- `searchResultUrlLegacy` conserva el mapa CRM/OPS completo.

### Verificar

- Hard refresh → ⌘K: sin Crear lead / cotización / ticket / Ir a Core.
- Debe verse Nuevo cliente → `/erp/clientes/nuevo`.

## A medias

Nada.

## Siguiente

Lo que Adam diga.

## No tocar

Puente NAS. Plan file.
