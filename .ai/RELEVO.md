# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-04
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Personas: eliminar visible / force

Diagnóstico + UX fix para «Eliminar de todos los terminales» que parecía no guardar.

### Causa

1. Sin `?force=1`, el espejo solo se limpia si **todos** los ACS OK → un fallo = la persona se queda (parece que no guardó).
2. Errores solo arriba (`IgError`); sin toast; force checkbox poco visible / cache vieja en screenshot.
3. Inventario ACS OK: `.160–.163` (Acceso General `.163`). `.155` muerto **no** está en DB.

### Qué hay

1. **UI** — caja «Forzar baja en NEXARA (force)» visible; toast OK/error; error inline en zona de peligro con IPs; tras fallo parcial auto-marca force + scroll.
2. **API** sin cambio de contrato — `DELETE …/people/:id?force=1` + tombstone (`integraPersonDeletePending`) ya existían desde `fa7bd33`.
3. Deploy web pendiente al cerrar este turno (`deploy/update.sh`).

SSH: `-i ~/.ssh/id_ed25519_nexara_hetzner -p 2222 root@5.78.215.109` →
`/var/www/nexara-app`

### Cómo borrar bien (ops)

1. Hard refresh Personas.
2. Abrir ficha → zona de peligro → marcar **Forzar baja en NEXARA** si un ACS falló o quieres que salga del espejo sí o sí.
3. Ver toast + lista por IP; sync no reimporta mientras haya tombstone.

## A medias

1. Portal empleado · ANPR ITC · micros · TCPMSS.
2. Espacios / Horarios ACS / presence / SOC — validar en prod aparte.
3. FieldDetection re-apply · employeeNumber↔personId Oficinas.
4. Redis eviction `allkeys-lru` (BullMQ pide `noeviction`) — no tocado.

## No tocar

Puente NAS, Traefik, credenciales. Face ID óptico inventado.
