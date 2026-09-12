# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-12
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Trayecto GPS jerárquico + fotos

### Hecho

1. **Sin trayecto de David hoy (dato real):** su entrada tiene `entryLatitude/Longitude = null` y 0 filas en `locationTracking`. No es un bug de UI: la checada no guardó GPS. Mensaje clarificado en `GpsTrajectoryPreview`.

2. **Quién ve trayecto**
   - Dirección (`GPS_MANAGE`: Christian / dirs): propio + cualquiera.
   - Encargados (`ATTENDANCE_MANAGE` sin `GPS_MANAGE`): **solo subordinados** (`managerId` subtree). **No** ven el propio.
   - Campo (`GPS_VIEW` sin manage): solo el propio.

3. **UI:** panel «GPS del día» oculto en tarjeta propia de encargados; pestaña Trayectoria sin «Mi trayecto» para ellos. `SessionImage` carga fotos `/uploads` con `credentials: include` (cookie HttpOnly).

Archivos: `gps.service.ts`, `gps.controller.ts`, `asistencias/page.tsx`, `AttendanceGpsDayPanel.tsx`, `SessionImage.tsx`, `GpsTrajectoryPreview.tsx`, `attendance.service.ts` (`??` coords).

### Verificar

1. **Reiniciar API** (Nest) para cargar `gps.service`.
2. Hard refresh Asistencias.
3. Como Christian: foto de entrada de David vía SessionImage; GPS del día explica si no hay coords.
4. Como David: sin «Mi trayecto»; sí puede abrir GPS del día en subordinados (cuando tengan puntos).

## A medias

Nada.

## Siguiente

Si quieren trayecto real: al fichar hay que conceder ubicación (coords en la entrada). Consentimiento de rastreo continuo es aparte (`PATCH /gps/consent`).

## No tocar

Puente NAS. Plan files.
