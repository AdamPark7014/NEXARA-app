# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — AcuSense al límite (Field/Line/Face/Motion + push)

Adam: maximizar cajas y tasa de eventos en cámaras LAN `.171–.178`
(DS-2CD2123G2-LIS2U). Sin Face ID óptico inventado.

### Qué cambió (código)

1. **`enableMaxSmartDetection`** (hikvision-isapi): FieldDetection todas las
   regiones, polígono full-frame, `sensitivityLevel=100`, `timeThreshold=0`,
   `alarmConfidence=low`, `detectionTarget=human` (Almacén → `human,vehicle`).
2. **Bugfix**: el tag real es `sensitivityLevel` (antes `sensitivity` —
   firmware lo ignoraba; regiones off / sens 50).
3. **LineDetection** mid-frame; **FaceDetect** (cajas, no ID); **Motion** 80;
   substream H.264; audio ON si hay mic.
4. **`ensureSmartEventTriggersCenter`**: field/line/face/VMD → center/httpHosts.
   `uploadImagesDataType=binary` + `httpBroken=false`.
5. **`wireDevices(detection)`** → enableMaxSmartDetection en AcuSense;
   NVR PoE vehicle y PTZ motion intactos.
6. Parser facedetection → FaceRect raíz. Docs INTEGRA-LAN Smart verificadas.

### Probe (.178)

SmartCap Field+Line+FaceDetect; Intrusion 404. Antes: FD regions disabled,
httpHosts sin binary. Sub ya H.264 640x360.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109`
`./deploy/update.sh --force-all` luego wire detection site 1.

### Verificar

1. FieldDetection/1: 4 regiones on, sens 100, poly full.
2. httpHosts binary. Eventos fielddetection↑. Meeting Room multi-caja.

## Concurrente (no pisar)

Asistencia híbrida · Eventos ACS UI · CRM/ops notifications · stock · Personas.

## A medias

1. Portal · ANPR · micros · TCPMSS.
2. Confirmar wire+event rate post-deploy.
3. employeeNumber↔personId Oficinas.

## No tocar

Puente NAS, Traefik, credenciales, Face ID inventado. CRM/stock/asistencia siblings.
