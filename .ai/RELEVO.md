# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Integra UX intuitiveness (Video / Personas / Eventos / Accesos)

Auditoría + fixes quirúrgicos de discoverability y feedback. Sin pelear
FieldDetection / ISAPI discovery / biometrics profundos del sibling.

### Qué hay

1. **Chrome** — accesos rápidos permanentes: Video · 24h, Accesos, Alta persona,
   Eventos Face. Sync con toast éxito/error (ya no silencioso).
2. **Video** — CTA toolbar «Playback 24h» (un clic fija rango + reproduce).
   Presets 1h/24h ya no dejan el callejón «solo cambiaron fechas». Copy ES
   sobre límites NVR/disco. Labels muro/foco más claros.
3. **Accesos** — título Accesos; doble clic = abrir momentáneo; toast en
   control/privilegios; empty → Personas; aviso stream puerta sin señal.
4. **Personas** — título «Personas · alta ACS»; CTA Alta también en Artemis;
   link Eventos Face; toast sync; copy Face ID = terminales, no cámaras.
5. **Eventos Face** (sobre vista ACS push del sibling) — título, Hoy + Alta
   persona en toolbar, IgNotice límites hardware, empty states con CTAs,
   detalle sin personId → alta.
6. **Nav** — labels matriz/section-views: Video · 24h, Eventos Face, Accesos.
7. **Ops home** — CTAs Alta / Eventos Face / Video · 24h + «Ver todos» en feed.

### Concurrente (siblings — no pisar)

Eventos ACS push KPIs/índices · FieldDetection/AcuSense · Face ACS JPEG /
Personas biometrics CRUD · CRM OC PDF · stock historial · PTZ · hybrid
attendance · identity-link WIP.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` · `deploy/update.sh --force-all` (rebuild api+web)

### Verificar (hard refresh)

1. Barra Integra: Video · 24h / Accesos / Alta persona / Eventos Face en 1 clic.
2. `/integra/video` → Playback 24h abre foco y pide grabación (o error NVR claro).
3. `/integra/events` → Hoy + KPIs; empty con Ir a Personas; sin ruido VMD.
4. `/integra/access` → doble clic puerta pide confirmación; toast al ejecutar.
5. `/integra/people` → + Nueva persona visible; sync con toast.

## A medias

1. Portal empleado · httpHost NVR · ANPR ITC · micros · TCPMSS.
2. Alinear códigos employeeNumber↔personId en plantilla real Oficinas.
3. go2rtc.yaml en disco corruptible — streams viven en RAM.
4. FieldDetection re-apply tras sync/push install.
5. identity-link WIP (rescate) — no cableado a AppModule.

## No tocar

Puente NAS, Traefik, credenciales, ISAPI no verificada.
Face ID óptico inventado. No pelear PTZ pad / Personas biometrics CRUD /
hybrid attendance internals / stock detail / OC PDF / FieldDetection XML
del sibling.
