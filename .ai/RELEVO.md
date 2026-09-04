# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Integra UX intuitiveness (Video / Personas / Eventos / Accesos)

Auditoría + fixes quirúrgicos de discoverability y feedback. Sin pelear
FieldDetection / ISAPI discovery / biometrics profundos del sibling.
(Concurrente: también aterrizó Exports PDF/Excel HR·Ops·Finance en la rama.)

### Qué hay (UX Integra)

1. **Chrome** — quick nav: Video · 24h, Accesos, Alta persona, Eventos Face.
   Sync con toast éxito/error.
2. **Video** — CTA «Playback 24h» un clic (rango + reproduce). Presets 1h/24h
   ya no dejan solo fechas. Copy ES límites NVR/disco.
3. **Accesos** — doble clic abrir; toasts control/privilegios; empty → Personas.
4. **Personas** — «Personas · alta ACS»; Alta también Artemis; link Eventos;
   toast sync; Face ID = terminales ACS.
5. **Eventos Face** (sobre vista ACS push) — Hoy + Alta en toolbar, IgNotice,
   empty CTAs, detalle sin ID → alta.
6. **Nav** — Video · 24h / Eventos Face / Accesos en matriz + section-views.
7. **Ops home** — CTAs Alta / Eventos / Video · 24h + Ver todos en feed.

### Concurrente (siblings — no pisar)

Exports PDF/Excel HR·Ops·Finance · Eventos ACS push KPIs · FieldDetection ·
Face ACS JPEG / Personas biometrics · CRM OC PDF · stock · PTZ · hybrid ·
integra-spaces / SpacePolicy · identity-link.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` · `deploy/update.sh --force-all`

### Verificar (hard refresh)

1. Barra Integra: Video · 24h / Accesos / Alta persona / Eventos Face.
2. `/integra/video` → Playback 24h (o error NVR claro).
3. `/integra/events` → Hoy + KPIs; empty con Ir a Personas.
4. `/integra/access` → doble clic + toast.
5. `/integra/people` → + Nueva persona; sync toast.

## A medias

1. Portal empleado · httpHost NVR · ANPR · TCPMSS.
2. employeeNumber↔personId Oficinas.
3. go2rtc.yaml corruptible — streams en RAM.
4. FieldDetection re-apply.
5. identity-link / integra-spaces WIP.

## No tocar

Puente NAS, Traefik, credenciales, ISAPI no verificada.
Face ID óptico inventado. No pelear PTZ / Personas biometrics CRUD /
hybrid internals / stock detail / OC PDF / FieldDetection XML / SpacePolicy
modelo del sibling.
