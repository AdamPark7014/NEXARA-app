# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-11
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Asignación dinámica por tipo + equipo

### Cómo queda el modelo (ola1)

- **No** módulos sidebar Tareas/Proyectos/Servicios: el hub es **Actividades** (pizarra).
- Tipos: Tarea · Proyecto · Obra · Servicio · Comercial (`activity-kinds.ts`).
- Christian (CEO): los 5. David (`operaciones@` / coord_ops): Tarea, Proyecto, Obra.
- Flujo: asignas a una persona (responsable). Opcional: sumas equipo (`POST /activities/:id/team`).
- David puede recibir y luego reasignar (`/reasignar` ya existe en API). Christian puede ir directo a un instalador.
- Formulario Core sin jerga OT (`tone="core"`).

### Hecho

1. `lib/activity-kinds.ts` + matriz por rol.
2. Asignar: avatar + tipos + chips de equipo extra + form limpio.
3. OpsActivityForm: tone core, hide responsable, forced ticket types.

### Pendiente / siguiente

- Selector de **cliente de servicio** cuando tipo = Servicio.
- UI de reasignación/delegación en el perfil de la persona.
- Hard refresh si el menú viejo “Tareas/Proyectos” sigue visible.

## No tocar

Puente NAS. Credenciales. Plan file.
