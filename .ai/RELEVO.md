# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Personas delete ISAPI (no Artemis)

Bug: force delete en Personas devolvía
`Operación Artemis no disponible en sitio ISAPI…` aunque el sitio Oficinas es ISAPI.

### Causa

`IntegraArtemisService.deletePerson` (y alta/edición/face/FP) llamaban
`this.client()` **antes** del branch ISAPI. `client()` exige cliente Artemis
(`resolved.client`); en ISAPI es `null` → 400 Artemis. El fan-out
`deleteUserInfo` / UserInfoDetail/Delete nunca se ejecutaba.

### Qué hay

1. Person mutations usan `sites.resolveClient` primero; ISAPI entra al fan-out ACS.
2. Artemis solo si hay `resolved.client` tras el branch ISAPI.
3. `force=1` + tombstone sin cambio de contrato.
4. Deploy API a prod en este cierre.

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app`

### Cómo verificar (ops)

1. Hard refresh Personas.
2. Eliminar (force) → toast OK o detalle por IP (`.160–.163`), **nunca** el error Artemis.
3. Provider del sitio sigue ISAPI.

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. Espacios / Horarios ACS / presence / SOC — validar en prod aparte.
3. FieldDetection re-apply · employeeNumber↔personId Oficinas.
4. Redis eviction `allkeys-lru` (BullMQ pide `noeviction`) — no tocado.
5. Vehículos / otros métodos que aún llaman `this.client()` antes del branch ISAPI — mismo patrón; no tocados en este turno.

## No tocar

Puente NAS, Traefik, credenciales. Face ID óptico inventado. Provider del sitio no cambiar a ARTEMIS.
