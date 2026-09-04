# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Live detection hotpath (ráfagas) + ACS face

Sin Face ID óptico sobre AcuSense. UI lista para más eventos tras wire sibling.

### Live detection hotpath

1. **Bus SSE/poll**: fan-out 32 ms + dedupe por id; poll 1.2 s / 280 ms;
   reconnect 800 ms.
2. **Paint ~30 fps** (rAF): merge sticky en refs; edad 1 Hz.
3. **Multi-caja**: nombres distintos no se fusionan; tope 12; VMD 90 s.
4. **Stream**: `preloadGo2rtcPlayer`; remount 2.6 s; stagger 90 ms;
   fallback MSE 4.5 s.
5. Placa óptica: «Humano · sin ID».

### ACS face / build

1. JPEG enrolado al instante en primer SSE; snapshot 102→101 diferido.
2. Build: `identity-link` usa `orgRoleKey`; tsc api limpio.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` → `./deploy/update.sh --force-all --with-migrate`

### Verificar (hard refresh Video)

1. Sticky multi-caja Meeting Room sin lag bajo ráfagas.
2. Banner ACS &lt;1 s; Eventos cards.
3. PTZ no eterno en «Conectando…».

## A medias

Portal empleado · ANPR · confirmar wire+event rate en prod.

## No tocar

Puente NAS, Traefik, credenciales, Face ID inventado.
Personas enroll CRUD del face sibling.
