# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Fix redirect Clientes → CRM

### Hecho

- Causa: `legacy-path-remap` mandaba `/erp/clientes` → `/crm/clients` (bucle con el redirect).
- `/erp/clientes` queda canónico (como asistencias/actividades).
- `/erp/clients` → `/erp/clientes`.
- Tests remap OK. CRM page usa `location.replace` de respaldo.

### Verificar

- Hard refresh → Core → Clientes → URL `/erp/clientes` (Nexara CORE, no CRM).
- Sidebar con Chat / Actividades / Asistencias / Clientes.

## A medias

Nada.

## Siguiente

Smoke UI.

## No tocar

Puente NAS. Plan file.
