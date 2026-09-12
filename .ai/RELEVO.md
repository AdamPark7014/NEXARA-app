# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-11
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Fix 400 Asistencias

### Hecho

1. Bug: regex `/erp/asistencia(\/?.*)` matcheaba **asistencias** → `/erp/hr/attendances`.
2. Esa URL caía en `hr/[id]` con id=`attendances` → API `/users/attendances` → 400.
3. Fix: preservar `/erp/asistencias`; regex `asistencia(\/.*)?`; redirect `/erp/hr/attendances` → Core.

### Verificar

- Hard refresh → menú **Asistencias** → `http://127.0.0.1:3000/erp/asistencias` (tabs Equipo/Comidas/Trayectoria).
- No debe aparecer breadcrumb RRHH/Attendances ni sidebar vacío.

## No tocar

Puente NAS. Credenciales. Plan file.
