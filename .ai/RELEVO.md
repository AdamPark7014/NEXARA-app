# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Tiempos con segundos

### Hecho

- `AttendanceForm`: «Total hoy» vive en HH:MM:SS (suma minutos cerrados + elapsed).
- `formatTotal` (resumen semana/mes y días) también HH:MM:SS.
- Equipo del día: hora de entrada/salida con segundos (`fmtTime`).

### Verificar

Hard refresh David → Total hoy ticks `00:0x:yy` con segundos como el chip de estado.

## A medias

Nada.

## Siguiente

Lo que Adam diga.

## No tocar

Puente NAS. Plan file.
