# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno (cursor) — Personas + placas SOC (sin magia)

### Identidad vs detección óptica

En cámaras de **oficina** (AcuSense) el overlay dice **«Humano · sin ID»**:
FieldDetection trae caja sin `name`/`employeeNo`. Face ID del directorio **no**
se proyecta sobre Support/Meeting: solo identifica en **puertas** (ACS event).
Con 4 personas sentadas es normal ver 0–2 cajas (aviso puntual, no tracking).

Panel **En sitio ahora** (`GET integra/occupancy`) = ocupación por accesos
concedidos hoy, no PeopleCounting VCA (`isSupportPeopleDetection=false`).

### Personas ISAPI

- CRUD: `UserInfo/Record|Modify|Delete` fan-out a todos los ACS del sitio
- Foto: `FDLib/FaceDataRecord` multipart + `FDSearch/Delete`
- UI `/integra/people`: editar, alta, subir/quitar foto, resultados por IP

### Vehículos / placas

- Lista NEXARA (`integra/vehicles`) en ISAPI; **no** se empuja al NVR (403)
- `anprCapable` en `raw` de cámara (sonda Traffic/Smart); PTZ marca sin ANPR
- `GET integra/plate-events` — vehículos detectados; `plate` solo si el evento
  trae OCR (ITC futuro)
- PTZ hold-to-move intacto

SSH: `-p 2222 root@5.78.215.109` → `/var/www/nexara-app`

## Muro / audio / push / TargetRect / PTZ / asistencia

Ver historial en commits previos (`2d9e868`…`6fdd7ac`). Resumen operativo:

- Muro `mode=auto` (MSE → snapshot); Foco MSE
- Push inbox `/api/integra/hik/:siteId/:token`; TargetRect = persona
- PTZ momentary + stop al soltar
- Asistencia `/integra/attendance`; fotos en `/uploads/integra/...` con sesión
- NVR `.34` no acepta httpHost; PTZ sin FieldDetection; faceURL 404 en DS-K1T

## A medias

1. Portal del empleado (User↔`employeeNo`).
2. httpHost del grabador (Escalera/Azotea/Office Entrance sin push).
3. Comprar cámara ANPR (ITC) si se quieren matrículas reales.
4. Encender micros / Hik-Connect alarms — decisión Adam.
5. Desplegar este turno (api+web) y hard-refresh Personas/Video/Vehículos.
6. TCPMSS / biblioteca init / empresas 1-2.

## No tocar

Puente NAS, Traefik, credenciales en repo, rutas ISAPI no verificadas.
