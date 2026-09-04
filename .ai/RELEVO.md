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
2. **Bugfix**: el tag real es `sensitivityLevel` (antes se escribía
   `sensitivity` y el firmware lo ignoraba).
3. **LineDetection** línea horizontal mid-frame; **FaceDetect** (cajas, no ID);
   **Motion** sens. 80; **substream H.264** confirmado; audio ON si hay mic.
4. **`ensureSmartEventTriggersCenter`**: field/line/face/VMD → `center`
   (httpHosts). `uploadImagesDataType=binary` + `httpBroken=false`.
5. **`wireDevices(detection)`** usa `enableMaxSmartDetection` en AcuSense;
   NVR PoE vehicle y PTZ motion intactos.
6. Parser: `facedetection` usa `FaceRect` de la raíz del alert.
7. Docs `INTEGRA-LAN.md` rutas Smart verificadas en vivo.

### Probe real (prod → NAS → .178)

- SmartCap: Field+Line+FaceDetect true; IntrusionDetection 404; Parking false.
- Antes: regiones FieldDetection **todas disabled**; httpHosts sin binary.
- Substream ya H.264 640×360; audio true.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` → `./deploy/update.sh --force-all`

### Verificar

1. Tras deploy: `POST .../sites/1/push/wire` con `{detection:true}` (o script).
2. GET FieldDetection/1 en .178 → 4 regiones enabled, sens 100, poly full.
3. httpHosts/1 → `uploadImagesDataType=binary`.
4. Eventos fielddetection↑; Meeting Room multi-caja sticky.

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. Confirmar wire+event rate en prod tras este deploy.

## No tocar

Puente NAS, Traefik, credenciales, Face ID inventado sobre AcuSense.
CRM/stock/asistencia siblings.
`}
