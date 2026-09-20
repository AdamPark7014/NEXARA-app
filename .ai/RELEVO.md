# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** mejora/calidad-y-web
- **HEAD:** UI limpia herramientas + Contabilidad → hub

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

Adam seguía viendo UI sucia en **prod** (`/erp/almacen/herramientas` y `/erp/accounting`).

### Herramientas
- `ToolInventoryPanel`: `MetricStrip` en vez de 5 `KpiCard` + barra «Por estado»
- URLs opcionales detrás de `<details>`
- CSS: dropzones/galería más compactos, borde neutro, título sin primary

### Contabilidad
- Entrada panel/menú: `/erp/contabilidad` (access-matrix, panel-routing, module-map, FinanceModuleRail)
- Remap: `/erp/accounting` → `/erp/contabilidad`
- Página legacy: sin `FinanceModuleRail` ni banner de viáticos; título «Pólizas y libros» + enlace al hub

**Nota:** cambios en `mejora/calidad-y-web` — **no están en prod** hasta push + deploy (sigue BLOCKED sin IP Hetzner).

## A medias

- Deploy BLOCKED: `HostName REEMPLAZA…`
- Soft highlight «Banca y conciliación» en sidebar (si sigue): revisar focus ring ContextRail

## Siguiente

1. Adam: IP Hetzner.
2. Push + `./deploy/update.sh --force-all`.
3. Abrir `/erp/contabilidad` y `/erp/almacen/herramientas` en prod.

## No tocar

Puente NAS.
