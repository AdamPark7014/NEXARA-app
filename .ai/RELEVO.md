# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Flujo Luis → Antonio → Carolina/Alejandro

### Modelo (confirmado)

```
Christian ──► cualquiera (tarea/proyecto/obra/servicio/comercial)
     │
     ├─ David (instaladores) · tarea/proyecto/obra → Joan/Israel/Juan José
     ├─ Luis (servicios) · tarea/servicio ──► Antonio (puente)
     └─ Antonio (sistemas) · tarea/proyecto + servicio-puente
              └─ Carolina (soporte) · Alejandro (sistemas)
```

Servicio: Luis/Christian ponen **día+hora** → Antonio → delega a Carolina/Alejandro (misma agenda o la edita).

### Hecho

1. Seed: Luis servicios, Antonio sistemas, Carolina+Alejandro activos bajo Antonio.
2. `activity-kinds.ts` matriz por email + puente servicio.
3. Asignar: si servicio no va a Antonio → banner “Ir a Antonio”.
4. Form Core: día + hora obligatorios en servicio/obra.
5. Seed ejecutado (13 activos).

### Verificar

- Login Luis → solo Tarea/Servicio; al asignar servicio a otro → aviso puente.
- Login Antonio → Tarea/Proyecto/Servicio; equipo Carolina/Alejandro.
- Christian sigue viendo los 5 tipos.

## No tocar

Puente NAS. Credenciales. Plan file.
