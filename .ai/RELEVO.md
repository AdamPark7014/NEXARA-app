# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-11
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Actividades = ex-Pizarra (sin menú Tareas/OT)

### Hecho

1. Sidebar Core: quitados Tareas / Proyectos / Servicios (ruido OT).
2. **Pizarra → label Actividades** (ruta sigue `/erp/pizarra`).
3. Listas `/erp/actividades/*` y aliases EN → redirect a pizarra.
4. Asignar: foto de la persona + tipos según permiso (Tarea del día / Proyecto / Servicio CEO) sin decir “OT”.
5. Copy perfil: “En actividad” en vez de “En la OT”.

### Verificar

- Sidebar HOY: Chat, Actividades, Asistencias (sin grupo Actividades).
- Actividades → persona → Asignar → opciones amigables.
- Hard refresh si el menú viejo sigue cacheado.

## No tocar

Puente NAS. Credenciales. Plan file.
