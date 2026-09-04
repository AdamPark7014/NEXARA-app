# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Live detection hotpath (ráfagas + sticky)

UI lista para más FieldDetection tras wire sibling. Sin Face ID óptico.

### Qué cambió

1. **Bus SSE/poll**: fan-out coalescido 32 ms + dedupe por id; poll 1.2 s
   (SSE sano) / 280 ms (degradado); reconnect 800 ms.
2. **Paint ~30 fps**: merge sticky en refs + rAF; edad placa 1 Hz.
3. **Multi-caja**: nombres distintos no se fusionan; tope 12; VMD 90 s.
4. **Stream**: `preloadGo2rtcPlayer`; remount 2.6 s; stagger muro 90 ms;
   fallback MSE 4.5 s.
5. Placa óptica: «Humano · sin ID».

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` → `./deploy/update.sh --force-all --with-migrate`

### Verificar (hard refresh Video)

1. Sticky multi-caja Meeting Room sin lag bajo ráfagas.
2. Banner ACS &lt;1 s; Eventos con cara.
3. Stream no se queda eterno en «Conectando…».

## A medias

Portal empleado · ANPR · confirmar tasa eventos tras wire AcuSense.
Schedules ACS UI (sibling) — build api debe quedar limpio.

## No tocar

Puente NAS, Traefik, credenciales, Face ID inventado.
Personas enroll / FieldDetection wire del sibling.
