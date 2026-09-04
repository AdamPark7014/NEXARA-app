# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — ACS face al límite (sin AcuSense Face ID)

No inventamos matching óptico sobre cámaras de oficina. Maximizamos ACS +
NEXARA: JPEG persistido, push/SSE, FaceDataRecord + FDSearch, snapshot rápido.

### Qué cambió

1. **Ingest push**: acceso ACS con `personId` adjunta **cara enrolada** al
   instante (sin ISAPI) → banner/events con foto en el primer SSE.
2. **Snapshot**: canal **102** luego 101; siempre en background y re-SSE
   (sustituye foto si llega captura de puerta).
3. **FaceDataRecord**: validación tamaño 8 KB–1.8 MB; meta Postman
   (`faceLibType` en FaceInfo); post-upload **FDSearch** por terminal.
4. **Banner live**: actualiza foto cuando el mismo evento re-llega con
   `photoPath`.
5. UI Personas: guía de calidad JPEG (480–720 px / 50–400 KB).

httpHosts ya se cablean con `wireDevices` (cámaras con imágenes; ACS sin
`uploadImagesDataType`). Re-aplicar desde Integra → Ajustes si hace falta.

### Concurrente (siblings — no pisar)

CRM · stock · asistencia híbrida · PTZ vehicle notes.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109`

### Verificar (hard refresh)

1. Personas: subir JPEG bueno → ficha muestra cara; note FDSearch.
2. Pase por puerta: banner con cara **inmediata** (enrolada); luego puede
   refrescar con snapshot del terminal.
3. Eventos ACS: cards con foto.
4. Video: nameplates ACS sticky; cajas AcuSense siguen «Humano · sin ID».

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. Re-wire httpHosts tras cambios de PUBLIC_API_URL.
3. CaptureFaceData en sensor del terminal (si firmware lo expone en Oficinas).

## No tocar

Puente NAS, Traefik, credenciales.
**No** Face ID óptico inventado sobre AcuSense/RTSP.
