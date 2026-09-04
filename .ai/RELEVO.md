# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Live detection hotpath + AcuSense max (sibling wire)

Adam: UX detección en vivo al límite bajo ráfagas (sibling reconfigura
cámaras `.171–.178`). Sin inventar Face ID óptico.

### Live detection hotpath (UI/SSE — este agente)

1. **Bus SSE/poll**: fan-out coalescido 32 ms + dedupe por id; poll 1.2 s
   con SSE sano / 280 ms degradado; reconnect 800 ms.
2. **Paint ~30 fps** (rAF + refs): merge sticky; edad placa 1 Hz — no se
   frena el poll con FieldDetection a tope.
3. **Multi-caja**: nombres distintos no se fusionan; tope 12; VMD 90 s.
4. **Stream**: `preloadGo2rtcPlayer`; kicks densos; remount 2.6 s;
   stagger muro 90 ms; fallback MSE 4.5 s.
5. Índices `integra_push_events_*`; placa óptica «Humano · sin ID».

### AcuSense max wire (sibling — hardware)

1. `enableMaxSmartDetection`: Field todas regiones, poly full-frame,
   `sensitivityLevel=100`, Line/FaceDetect/Motion; triggers → center.
2. Bugfix: tag real `sensitivityLevel` (antes `sensitivity` ignorado).
3. Parser `facedetection` usa FaceRect raíz; docs INTEGRA-LAN.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` → `./deploy/update.sh --force-all --with-migrate`

### Verificar (hard refresh)

1. Video: sticky multi-caja Meeting Room sin lag bajo ráfagas.
2. ACS banner &lt;1 s; Eventos cards / En vivo.
3. Tras wire: FieldDetection enabled sens 100; httpHosts binary.
4. Óptica: «Humano · sin ID» — no Face ID de oficina.

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. Confirmar tasa de eventos tras wire+deploy.
3. Migración índices push si no aplica sola.

## No tocar

Puente NAS, Traefik, credenciales, Face ID inventado sobre AcuSense.
Personas enroll CRUD del face sibling.
