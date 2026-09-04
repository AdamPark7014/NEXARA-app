# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Live detection hotpath (ráfagas + sticky multi-caja)

Prioridad Adam: UX de detección en vivo al límite mientras siblings
reconfiguran cámaras (más eventos). Sin inventar Face ID óptico.

### Qué cambió

1. **Bus SSE/poll (`_DetectionOverlay`)**: fan-out coalescido 32 ms + dedupe
   por id (foto diferida pisa); poll 1.2 s si SSE sano / 280 ms si degradado;
   reconnect SSE 800 ms; lote por chunk de red.
2. **Paint throttled (~30 fps)**: merge/sticky en refs; `setState` por rAF —
   no se ralentiza el poll. Edad de placa a 1 Hz.
3. **Multi-target sticky**: merge lote entrante + tracks; nombres distintos
   no se fusionan (Meeting Room); tope 12 cajas; presencia VMD 90 s.
4. **Stream más rápido**: `preloadGo2rtcPlayer` al abrir Video; kicks densos;
   remount anti-stuck 2.6 s; muro stagger 90 ms; fallback MSE 4.5 s.
5. **Backend ya en rama**: `attachSnapshotLater` (SSE nombre/FaceRect antes
   de JPEG); índices ACS `integra_push_events_*` (migración
   `20260904160000_integra_push_events_acs_indexes`).
6. **Eventos / banner** (turno facial previo): tarjetas + live SSE; placa
   «Humano · sin ID» vs nombre ACS.

### Concurrente (siblings — no pisar)

Personas enroll/face storage · FieldDetection wire · CRM/HR/stock.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` → `./deploy/update.sh`

### Verificar (hard refresh Video + Eventos)

1. Video muro/foco: cajas sticky multi-persona; sin lag con ráfagas.
2. Pase ACS: banner &lt;1 s con nombre (foto puede llegar después).
3. PTZ no se queda eterno en «Conectando…» (reintenta ~2.6 s).
4. Eventos: franja «En vivo · ACS» + cards con cara.
5. Óptica AcuSense sigue diciendo «Humano · sin ID».

## A medias

1. Portal empleado · httpHost NVR · ANPR ITC · micros · TCPMSS.
2. Re-aplicar FieldDetection en equipos (sibling); alinear employeeNumber↔personId.
3. Migración índices push: correr `prisma migrate deploy` en prod si no aplica sola.

## No tocar

Puente NAS, Traefik, credenciales, Face ID óptico inventado sobre AcuSense.
No reescribir Personas CRUD/enroll del sibling.
