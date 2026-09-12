# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Asistencias UI densa

### Hecho

- `AttendanceForm` con `compact`: barra de estado, CTA primaria según fase (Entrada → Salida), hint corto, resumen semana/mes colapsado.
- Cámara: copy «Capturar + GPS».
- `/erp/asistencias`: Section `dense` + `<AttendanceForm compact />`; refresco equipo en `attendance:updated`.

### Verificar

Hard refresh David → Mi jornada compacta; Entrada resaltada si no hay checada; Salida solo cuando hay jornada abierta.

## A medias

Nada.

## Siguiente

Lo que Adam diga.

## No tocar

Puente NAS. Plan file.
