# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — CEO ve checadas en vivo

### Hecho

- Causa: la entrada de David **sí** está en BD (`Attendance` + `AttendanceDay` abiertos 2026-09-12).
- Bug UI: en `/erp/asistencias` el refresh (poll + `attendance:updated`) solo corría si `canRegister && isManager`. Christian es `manage` (sin checador propio) → **nunca** refrescaba el equipo.
- Fix: socket realtime + poll 15s + focus/visibility para **todo** `isManager`.
- CEO/plataforma ya no mandan `scope=subtree` (company-wide).
- `jwt.strategy`: adjunta `email` al user (defensa company-wide).

### Verificar

1. Hard refresh como Christian en Asistencias → David debe salir **En jornada** (entrada ~13:17).
2. Con Christian abierto: otra ventana David checa → el KPI/lista de Christian se actualiza sin F5.

## A medias

Nada.

## Siguiente

Lo que Adam diga.

## No tocar

Puente NAS. Plan file.
