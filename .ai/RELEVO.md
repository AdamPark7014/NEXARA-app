# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-11
- **Rama:** cursor/core-ola1-cd
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Fase C+D (asistencias + actividades 3 buckets)

### Hecho

1. **Fase C** `/erp/asistencias` — tabs Equipo | Comidas | Trayectoria; reutiliza `attendance/hierarchy/range?scope=subtree`, `lunch-breaks`, `gps/team` + `GpsTrajectoryPreview`. Ops routes intactas.
2. **Attendance API** — `scope=subtree` en hierarchy range (CEO/plataforma company-wide; manager = árbol `managerId`).
3. **Fase D** `/erp/actividades/{diarias|proyectos|servicios}` — thin wrappers sobre `OpsActivitiesBoard` con `bucket` daily/projects/services. Servicios redirige no-CEO → diarias.
4. **Activities API** — `findAllScoped` (subtree no-CEO); validación soft `fechaInicio <= fechaMaxima` + ventana ≥ ayer en `update()`.

### A medias / siguiente

- Agent A: moduleAccess / sidebar (ocultar servicios para David).
- Agent B: pizarra completa (no tocado).
- No merge a `mejora/calidad-y-web` en este turno.

### Verificar (manual Adam)

- Login gerencia → `/erp/asistencias` tabs + `/erp/actividades/servicios` OK.
- Login manager/David → diarias/proyectos OK; servicios redirige; asistencias subtree.
- PATCH activity con `fechaInicio` > `fechaMaxima` → 400.

## No tocar

Puente NAS. Credenciales. Access-matrix wholesale (Agent A). Pizarra full (Agent B). No borrar rutas OPS.
