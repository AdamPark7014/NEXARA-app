# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — PTZ estacionamiento: vehículos honestos

Adam: «aquí ni detecta los autos en la PTZ». Hardware ya era honesto en UI.

### Verdad de hardware (prod + docs)

- **PTZ DS-2DF8C442 (.179):** FieldDetection/ANPR/ITC = `notSupport`. Motion sí.
- **Fuentes vehicle:** NVR PoE ch 1/2/9/10 — Escalera 01, Office Entrance,
  Escaleras 02, Azotea (`human,vehicle`). Canal 13 PTZ → 403.
- **Prod DB:** 0 eventos `vehicle` jamás. NVR PoE **no empuja** nada a NEXARA
  (solo AcuSense LAN con `human`). Autos quietos tampoco disparan inventario.

### Qué hay

1. `plateEvents` enriquece: fuentes con lastSeen, `siblingActivity`,
   `ptzMotion`, `nvrPushActive`, nota honesty (no inventario de estacionados).
2. `_VehicleStrip` en foco PTZ: banner hardware + lista de fuentes NVR +
   hits vehicle si llegan + actividad hermana etiquetada «no es ID vehicle».
3. Script `apps/api/scripts/wire-parking-nvr.cjs` — wire detection sin rotar
   token (`rotateToken: false`).
4. Fix NVR `httpHosts`: parchear plantilla XML (el NVR rechazaba JSON +
   `uploadImagesDataType` → `badXmlContent`). FieldDetection PoE 4/4 OK.
5. No se tocó `_DetectionOverlay` (otro agente TTL humanos).

### Cómo verificar (ops)

1. Hard refresh Video → PTZ.
2. Panel Vehículos: fuentes Azotea/Entrance/Escalera + aviso o pulse NVR.
3. Tras re-wire: NVR push=ok; movimiento en zona PoE lista vehicle con
   nombre de cámara fuente (no inventario de autos quietos).

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. FieldDetection re-apply NVR (script wire) — ejecutar post-deploy y validar.
3. Redis eviction `allkeys-lru` — no tocado.
4. Personas/vehículos Artemis `this.client()` pre-branch ISAPI — pendiente.

## No tocar

Puente NAS, Traefik, credenciales. Face ID óptico inventado. Provider ISAPI.
No inventar ANPR/FieldDetection en PTZ .179. No hls.js.
