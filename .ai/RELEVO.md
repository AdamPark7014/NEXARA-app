# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — PTZ/NVR/ACS al límite ISAPI (vehicle + wire)

Adam: placas/vehículos en PTZ + programar dentro de equipos.

### Verdad hardware (re-medida en prod)

| Equipo | Smart vehicle/ANPR | Qué sí |
|---|---|---|
| PTZ `.179` DS-2DF8C442 | FieldDetection/Line/Traffic/ITC **403/404**; SmartCap FD=false | Video + PTZ + **motion** (200). httpHosts ya apuntaba a NEXARA. 0 push históricos. |
| NVR `.34` ch **13** (PTZ) | FieldDetection **403** | — |
| NVR ch **1/2/9/10** PoE | FieldDetection **200** con `human,vehicle` (ya enabled) | **httpHosts estaba vacío** → no empujaba vehicle |
| AcuSense `.171-.178` | FD `human` / `human,vehicle` | Oficinas (no parking) |
| ACS `.160-.163` | FaceDataRecord + FP doc; sin FaceContrast inventado | httpHosts + FDLib |

### Código

1. `enableFieldDetection` / `enableMotionDetection` / `enableNvrParkingVehicleDetection` / `readHttpNotificationHosts` / `probeAcsIdentityCaps`.
2. `wireDevices`: asegura cabecera NVR; skip `192.168.254.*`; PTZ→motion; NVR→vehicle FD; `rotateToken:false` reusa URL viva.
3. `plate-events`: reconoce `human,vehicle`; lista `vehicleSources`; nota PTZ honesta.
4. UI: chips Video/PTZ/Motion vs Vehicle/Placas; VehicleStrip en PTZ = **sitio entero** (no filtra `.179`).

### Deploy / enable

Tras deploy: script `tmp-enable-absolute.js` en contenedor (cablea NVR+ACS, motion PTZ, reafirma FD PoE).

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` → `./deploy/update.sh`

### Verificar

1. Video → PTZ → HUD chips + banner límite; tira Vehículos sin «SIN ANPR» vacío confuso.
2. NVR httpHosts con URL integra; eventos vehicle desde Entrance/Azotea/Escalera.
3. ACS siguen empujando accesos (no romper face sibling).

## A medias

1. Portal empleado · ANPR ITC (hardware) · micros · TCPMSS.
2. Si motion PTZ sigue sin push: linkage Event/triggers (500 en sonda).
3. CaptureFaceData en sensor si firmware lo expone.

## No tocar

Puente NAS, Traefik, credenciales.
Face ID óptico inventado sobre AcuSense.
CRM/stock/asistencia siblings.

Cerrado: cursor 2026-09-04 PTZ/NVR/ACS absolute limit.
