# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Detección Video 24h: cajas sin ghost

Bug: overlays «Humano · sin ID» y PRESENCIA inflada (68–89s) en sillas
vacías / puerta de cristal (Meeting Room + muro).

### Causa

`_DetectionOverlay.tsx` tenía sticky intencional exagerado:
- `BOX_TTL_OPTICAL_MS=90s`, `BOX_TTL_NAMED_MS=75s`, `PRESENCE_HOLD_MS=90s`
- VMD/fielddetection **reiniciaba `at` y alargaba TTL** de todas las cajas
  sin TargetRect fresco → fantasmas eternos mientras hubiera movimiento
- Semilla `SEED_MS=120s` re-pintaba fantasmas al montar

### Qué hay

1. Optical TTL **3.5s**; ACS named **10s**; chip movimiento **4s**; seed **12s**.
2. VMD solo alimenta chip «Movimiento» — **no** resucita tracks.
3. Merge prefiere rect fresco (88/12) y `ttl` del evento nuevo.
4. Solo web (`_DetectionOverlay.tsx`). Provider ISAPI sin tocar. Sin ISAPI FieldDetection retune.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app` (rebuild `web`).

### Cómo verificar (ops)

1. Hard refresh Video 24h / Meeting Room.
2. Cajas «sin ID» no deben pasar de ~4s sin evento nuevo; al vaciarse la
   escena, fantasmas y PRESENCIA caen en pocos segundos.
3. ACS con nombre puede quedar ~10s; nunca 60–90s en silla vacía.

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. Espacios / Horarios ACS / presence / SOC — validar en prod aparte.
3. FieldDetection re-apply · employeeNumber↔personId Oficinas.
4. Redis eviction `allkeys-lru` (BullMQ pide `noeviction`) — no tocado.
5. Vehículos / otros métodos que aún llaman `this.client()` antes del branch ISAPI — mismo patrón; no tocados.

## No tocar

Puente NAS, Traefik, credenciales. Face ID óptico inventado. Provider del sitio no cambiar a ARTEMIS.
