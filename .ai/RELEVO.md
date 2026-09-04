# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — ACS face al límite + live detection hotpath

Sin inventar Face ID óptico sobre AcuSense. Maximizamos ACS + NEXARA.

### Face / Personas / push foto

1. **Ingest**: acceso ACS (`AccessControllerEvent` major 5) con `personId`
   adjunta **JPEG enrolado** al instante → banner/events en el primer SSE.
2. **Snapshot** diferido: canal **102** luego 101; re-SSE con captura de
   puerta (sustituye foto si llega).
3. **FaceDataRecord**: validación 8 KB–1.8 MB; meta con `faceLibType`;
   post-upload **FDSearch** por terminal (verifica enrolo).
4. Persistencia `uploads/integra-faces/`; proxy face sirve local primero.
5. UI: wizard foto obligatoria; guía 50–400 KB / 480–720 px.

### Live detection (mismo turno / sibling en rama)

Bus SSE/poll coalescido, sticky multi-caja, preload go2rtc — ver commits
recientes en `mejora/calidad-y-web`. Cajas AcuSense = «Humano · sin ID».

### Concurrente — no pisar

CRM · stock · asistencia · FieldDetection wire.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` → `./deploy/update.sh`

### Verificar (hard refresh)

1. Personas → Alta JPEG bueno → ficha con cara; note FDSearch.
2. Pase puerta → banner **inmediato** con cara enrolada; puede refrescar
   con snapshot.
3. Eventos → cards con foto.
4. Video → cajas sticky; ACS name ≠ Face ID de oficina.

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. Re-wire httpHosts si cambia PUBLIC_API_URL.
3. CaptureFaceData en sensor (si firmware Oficinas lo expone).

## No tocar

Puente NAS, Traefik, credenciales.
**No** matching Face ID inventado sobre RTSP/AcuSense.
