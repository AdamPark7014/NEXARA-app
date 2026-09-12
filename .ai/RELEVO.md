# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-11
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Tareas: fix 404 Diarias

### Hecho

1. Página canónica **Tareas**: `/erp/actividades/tareas` (sidebar label Tareas).
2. Redirects legacy: `actividades/diarias`, `activities/diarias`, `activities/tareas`, `activities/projects`, `activities/servicios`.
3. **Bug raíz:** `legacy-path-remap` traducía `actividades→activities` y `proyectos→projects` → 404. Ahora `/erp/actividades/*` se preserva.
4. page-matrix + url-matrix incluyen aliases EN.

### Verificar

- Hard refresh (Ctrl+Shift+R) — el 308 viejo puede estar cacheado en Chrome.
- Menú Actividades → **Tareas** → debe cargar board (no 404).
- URL canónica: `http://127.0.0.1:3000/erp/actividades/tareas`

## No tocar

Puente NAS. Credenciales. Plan file.
