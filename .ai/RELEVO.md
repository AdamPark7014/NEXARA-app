# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** mejora/calidad-y-web
- **HEAD:** (pendiente commit Workspace Contadora)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho

1. Hub Contadora `/erp/contabilidad/*` (layout + ContabilidadSidebar + páginas CxC/CxP/facturas/movimientos/conciliación/prenomina/presupuestos/proyectos/proveedores/reportes/cierres/auditoría).
2. API `GET accounting/workspace/dashboard` + authz tests.
3. Home RBAC: `roleKey===contabilidad` → `/erp/contabilidad` (también en Core-only).
4. Módulo `erp-contabilidad` en CORE_OLA1 + page/url matrix.

## A medias

hard-rbac · hard-pdf · hard-act-photos · hard-act-flow · hard-tools-ui · hard-prenomina (worktrees).

## Siguiente

- Deploy Hetzner + smoke login contadora → hub.
- Merge olas hardening restantes.

## No tocar

Puente NAS.
