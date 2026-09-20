# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** mejora/calidad-y-web
- **HEAD:** merge hard-org-mgrs + hard-org-ux + hard-warehouse
- **Migraciones:** ya aplicadas `2026092001*`

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho (hardening merge parcial)

1. Script org: JA/David/Luis/Daniela → Christian (`b6c91011`).
2. Orgchart: búsqueda, filtro área, zoom/pan (`91eb9d82`).
3. Almacén scanner: multi-op + debounce HID + RETURN (`04ca8f97`).

## A medias (worktrees aún escribiendo)

hard-rbac · hard-pdf · hard-act-photos · hard-act-flow · hard-tools-ui · hard-prenomina

## Siguiente

- Merge olas restantes → deploy → correr `fix-org-puestos-jefes.js` en prod.
- Plan Workspace Contadora pendiente de confirmación.

## No tocar

Puente NAS.
