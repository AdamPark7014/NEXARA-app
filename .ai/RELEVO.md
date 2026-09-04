# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Horarios ACS todas las puertas + indefinido + presets

Cierra el WIP abortado de schedules: path usable API+UI para **todas** las
puertas del sitio (no solo Sala de Juntas), vigencia indefinida vs temporal,
presets que materializan franjas en slots correctos.

### Qué hay

1. **Slots plantilla alineados** — `PRESET_TEMPLATE_SLOTS`: oficina=2,
   after-hours=4, weekend=5 (slot 3 = contratista/diurno). Antes after-hours
   iba a 3 y weekend a 4 (desfase vs UI/defaults).
2. **API** — `GET/PATCH people/:id/access`, catálogo `access-schedules` +
   alias `schedules`; `ensure-preset` en todos los ACS; listado por puerta con
   `planTemplateNo` desde espejo RightPlan.
3. **UI `/integra/schedules`** — vistas Por persona / Por puerta / Matriz;
   presets (24/7, oficina, after-hours, weekend, sala juntas, contratista,
   visita 1 día, sin acceso); CSS `sched*` en `integra.module.css`.
4. **`nest build` apps/api** — OK.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` · `bash deploy/update.sh --force-all`

### Verificar

1. Hard refresh `/integra/schedules` — tabs + presets visibles.
2. Persona → Indefinido 24/7 → Guardar → OK en .160–.163.
3. Misma persona → desmarcar indefinido + Hasta hoy → temporal.
4. Por puerta: lista con plantilla (no todo «1»).

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. Presence / SOC alarms — validar en prod aparte.
3. FieldDetection re-apply · employeeNumber↔personId Oficinas.

## No tocar

Puente NAS, Traefik, credenciales. Face ID óptico inventado.
