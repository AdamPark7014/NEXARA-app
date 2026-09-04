# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — PTZ/NVR/ACS al límite ISAPI (vehicle + wire + UX)

Adam: placas/vehículos en PTZ + programar dentro de equipos.

### Verdad hardware (re-medida prod)

| Equipo | Vehicle/ANPR | Qué sí |
|---|---|---|
| PTZ `.179` DS-2DF8C442 | FD/Line/Traffic/ITC **403/404**; SmartCap FD=false | Video+PTZ+**motion** (200). httpHosts OK. 0 push históricos. |
| NVR ch **13** (PTZ) | FD **403** | — |
| NVR ch **1/2/9/10** PoE | FD **200** `human,vehicle` (ya on) | **httpHosts vacío** → no empujaba |
| AcuSense `.171-.178` | FD human/vehicle | Oficinas |
| ACS `.160-.163` | FaceDataRecord+FP (doc); sin FaceContrast inventado | httpHosts+FDLib; JPEG NEXARA local |

### Código shipped

- Helpers: `enableFieldDetection`, `enableMotionDetection`, `enableNvrParkingVehicleDetection`, `readHttpNotificationHosts`, `probeAcsIdentityCaps`, `enableMaxSmartDetection` (AcuSense).
- `wireDevices`: NVR cabecera; skip PoE `254.*`; PTZ→motion; NVR→vehicle FD; `rotateToken:false`.
- `plate-events`: match `human,vehicle`; `vehicleSources`; nota PTZ.
- UI: chips Video/PTZ/Motion vs Vehicle/Placas; VehicleStrip PTZ = sitio entero.

### Concurrente (siblings en rama — no pelear)

CRM cotización PDF · exports · identity-link · spaces/schedules.

SSH + `./deploy/update.sh --force-all` (dist viejo no trae helpers).

### Verificar

1. Video→PTZ: HUD chips + banner límite; tira Vehículos site-wide.
2. NVR httpHosts con URL integra; vehicle desde Entrance/Azotea/Escalera.
3. Build API verde (cotizacion-pdf + identity-link arreglados para nest).

## A medias

1. ANPR ITC (hardware) · Event/triggers PTZ (500 en sonda) · micros · TCPMSS.
2. Tras deploy: `tmp-enable-absolute.js` en contenedor.

## No tocar

Puente NAS, Traefik, credenciales. Face ID óptico inventado sobre AcuSense.
