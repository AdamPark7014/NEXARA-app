# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Live detection hotpath + (sibling) PTZ/NVR wire

Adam: UX detección en vivo al límite bajo ráfagas (sibling reconfigura
cámaras). Sin inventar Face ID óptico.

### Live detection hotpath (este agente)

1. **Bus SSE/poll**: fan-out coalescido 32 ms + dedupe por id; poll 1.2 s
   con SSE sano / 280 ms degradado; reconnect 800 ms; lote por chunk.
2. **Paint ~30 fps** (rAF + refs): merge sticky; edad placa 1 Hz — no se
   frena el poll con FieldDetection a tope.
3. **Multi-caja**: nombres distintos no se fusionan; tope 12; VMD 90 s.
4. **Stream**: `preloadGo2rtcPlayer`; kicks densos; remount 2.6 s;
   stagger muro 90 ms; fallback MSE 4.5 s.
5. Índices `integra_push_events_*` (`20260904160000_*`);
   `attachSnapshotLater` + JPEG enrolado al instante (face sibling).
6. Placa óptica: «Humano · sin ID».

### PTZ/NVR wire (sibling — no pisar)

PTZ `.179` sin vehicle/ANPR (403/404); motion sí. NVR PoE ch 1/2/9/10 FD
`human,vehicle` + httpHosts. VehicleStrip sitio entero. Ver commits
`wireDevices` / `plate-events`.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` → `./deploy/update.sh --force-all --with-migrate`

### Verificar (hard refresh)

1. Video: cajas sticky multi-persona sin lag bajo ráfagas.
2. Pase ACS: banner &lt;1 s; Eventos «En vivo · ACS» + cards.
3. PTZ no eterno en «Conectando…»; chips motion vs vehicle honestos.
4. Óptica: «Humano · sin ID» — no Face ID de oficina.

## A medias

1. Portal empleado · ANPR ITC (hardware) · micros · TCPMSS.
2. Migración índices push en prod si no aplica sola.
3. Motion PTZ push / Event triggers si sigue vacío.

## No tocar

Puente NAS, Traefik, credenciales.
Face ID óptico inventado sobre AcuSense.
Personas enroll CRUD del face sibling.
