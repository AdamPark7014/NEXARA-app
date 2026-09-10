# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-09
- **Rama:** mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — continuar pendientes + deploy Hetzner

### Hecho

1. **Fotos asistencia RRHH**
   - API `GET /api/attendance/for-user?userId=&limit=` (ATTENDANCE_MANAGE).
   - Ficha `/erp/hr/[id]`: galería entrada/salida con foto (data-URI legacy o `/uploads/…`).
   - Bandeja `/erp/hr/attendance`: thumbs en TeamCard.
   - Persistencia: `UPLOADS_ROOT` + nunca guardar data-URI en DB; paths `/uploads/attendance/…`.
   - `resolveAssetUrl` reconoce `attendance/`.

2. **Homologación móvil OT Con/Sin proyecto**
   - Android `OpsNewActivityScreen` + iOS `OpsNewActivityView`.

3. **Deploy** (este cierre): push `mejora/calidad-y-web` + `deploy/update.sh` en Hetzner
   `/var/www/nexara-app` (API+web). Incluye RBAC viatics + UX Actividades + fotos.

### Verificar en prod

- Resumen ejecutivo con `coord_operaciones` → Reintentar (viatics).
- `/ops/activities/new` modos Con/Sin proyecto.
- `/erp/hr/13` fotos de Carolina.

## Heredado vivo

- Demo store / Apple enrollment sin cambio.
- Play Store APK: soft-fail dashboard ya en rama; fotos/OT móvil en próximo build.

## No tocar

Puente NAS. Credenciales. No fingir EN VIVO.
