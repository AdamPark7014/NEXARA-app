# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-11
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Tareas + asignar por tipo

### Hecho

1. Sidebar/rail: **Diarias → Tareas**.
2. Pizarra persona: un solo **Asignar actividad** → `/erp/pizarra/[id]/asignar`.
3. Ahí eliges **Tarea** o **Proyecto**; el form muestra campos según el tipo (proyecto pide proyecto/cliente; tarea no).
4. `OpsActivityForm`: `initialResponsableId`, `forcedProjectMode`, `hideProjectModePicker`.

### Verificar

- Menú Actividades → "Tareas".
- Perfil instalador → Asignar actividad → Tarea vs Proyecto → campos distintos → guardar.

## No tocar

Puente NAS. Credenciales. Plan file.
