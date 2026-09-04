# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Visitas recurrentes ACS desplegadas

Feature completa (UI + servicio + migración + endpoints Nest) en prod.

### Qué hay

1. **API en vivo** — Nest mapea:
   `GET/POST /api/integra/visitors/recurring`,
   `POST …/:id/cancel`, `DELETE …/:id`.
2. **UI** — `/integra/visitors` pestaña **Recurrente**: puertas, Lun–Vie,
   vigencia, foto JPEG, cancel → apaga ACS.
3. **How-to ES** — `docs/INTEGRA-VISITAS-RECURRENTES.md` (+ link INTEGRA-OPS).
4. **Deploy Hetzner** — `nexara-api` / `nexara-web` Up; migrate: sin pendientes
   (tabla `integra_recurring_visitors` ya aplicada). Hubo conflicto Docker
   Dead containers; limpios y recreados.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app`

### Verificar (ops)

1. Hard refresh `integra…/visitors` → Recurrente.
2. Alta Lun–Vie 09–18 + Acceso General → estado **En terminales**.
3. Cancel → `Valid.enable=false` en terminales.

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. Espacios / Horarios ACS / presence / SOC — validar en prod aparte.
3. FieldDetection re-apply · employeeNumber↔personId Oficinas.
4. Redis eviction `allkeys-lru` (BullMQ pide `noeviction`) — no tocado.

## No tocar

Puente NAS, Traefik, credenciales. Face ID óptico inventado.
