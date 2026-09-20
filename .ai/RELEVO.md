# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-20
- **Rama:** mejora/calidad-y-web
- **HEAD:** ariaLabel en DataTables presupuestos/proyectos/proveedores

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Hecho este turno

- Follow-up [Audit DataTable ariaLabel]: `ariaLabel` explícito en las 14 tablas que usaban el default `"Tabla"`:
  - presupuestos ×2
  - proyectos ×4
  - proveedores ×8
- Previos merges a11y-dropzone + datatable-aria siguen en la rama.

## A medias

- Deploy BLOCKED: `HostName REEMPLAZA_CON_IP_HETZNER`.
- Ramas gate con conflicto real aún fuera (factura, labels-cx, uuid, etc.).

## Siguiente

1. Adam: IP Hetzner + Port 2222.
2. Push + deploy `--force-all`.

## No tocar

Puente NAS.
