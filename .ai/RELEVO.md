# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-09
- **Rama:** mejora/calidad-y-web
- **HEAD:** `9de7e45f`

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — done + deploy Hetzner

### Hecho

1. Fotos asistencia RRHH (API `for-user`, ficha HR, bandeja, paths `/uploads/attendance`).
2. OT Con/Sin proyecto en Android + iOS.
3. **Deploy prod** `5.78.215.109:/var/www/nexara-app`
   - Push `origin/mejora/calidad-y-web` → `9de7e45f`
   - Primer `update.sh` solo reinició (sin rebuild); corregido con `--force-all --with-migrate --no-pull`
   - `nexara-api` + `nexara-web` recreados (healthy). Migraciones OK.

### Verificar en prod

- Resumen ejecutivo `coord_operaciones` → Reintentar (viatics).
- `/ops/activities/new` modos Con/Sin proyecto.
- `/erp/hr/13` fotos Carolina (data-URI legacy o uploads).

## A medias / siguiente

- Nada de código pendiente en esta ola.
- Próximo APK Play Store si se quiere soft-fail dashboard + OT Con/Sin en tienda.

## No tocar

Puente NAS. Credenciales. No fingir EN VIVO. No `git reset --hard` sin pedirlo Adam.
