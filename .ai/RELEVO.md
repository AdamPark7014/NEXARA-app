# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Detección personas: live sin ghosts ni apagón

Adam: «ahora ya no hace detección de personas» tras el corte TTL 90s→3.5s.

### Causa raíz

Eventos FieldDetection **sí llegaban** (prod 2h: 493 field + 83 line). Cadencia con
TargetRect: Meeting **p50≈16s**, Support 01/02 **p50≈12–13s**, Planning p90≈48s.
`BOX_TTL_OPTICAL_MS=3500` caducaba la caja **antes del siguiente evento** → sensación
de apagón. VMD ya no revive cajas (correcto; eso era el ghost).

### Qué hay

1. Óptica **15s** / ACS nombrada **20s** (puente p50; no 90s, no 3.5s).
2. VMD → solo chip «Movimiento · sin caja»; **nunca** reinicia `at` de tracks.
3. `Presencia · N` = solo cajas humanas/face **frescas** (no VMD stale).
4. Foco: empty «Sin detección reciente · FieldDetection». Muro sin empty spam.
5. Placas: «Humano · sin ID» / nombre ACS / «Vehículo · sin placa»; edad ≥2s;
   tooltip fuente (AcuSense vs ACS). Badge DET rail = 15s (`LIVE_DET_BADGE_MS`).

### Cómo verificar

1. Hard refresh Video 24h → Meeting / Support / Escalera.
2. Persona en escena → caja ~15s, sigue al moverse, caduca sin event fresco.
3. Foco vacío → mensaje FieldDetection. Rail `det` solo con detección viva.
4. No inventar Face ID en AcuSense. PTZ .179 sin FieldDetection (otro turno).

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. FieldDetection re-apply NVR (script wire) — validar push vehicle post-cable.
3. Redis eviction `allkeys-lru` — no tocado.
4. Personas/vehículos Artemis `this.client()` pre-branch ISAPI — pendiente.

## No tocar

Puente NAS, Traefik, credenciales. Face ID óptico inventado. Provider ISAPI.
No inventar ANPR/FieldDetection en PTZ .179. No hls.js.
