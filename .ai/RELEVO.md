# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-11
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Local up (migrate + seed + dev)

### Hecho

1. **Postgres local:** servicio Windows `postgresql-x64-17` en `localhost:5432` / db `nexara_db` (Docker Desktop NO necesario; daemon down).
2. **Migrate:** `prisma migrate deploy` aplicó `20260911190000_user_module_access` (171 migraciones OK).
3. **Seed:** `prisma db seed` (demo-users) — 17 usuarios actualizados; login OK gerencia/soporte/etc.
4. **Dev stack:** `npm run dev` (turbo api+web) corriendo en background.
   - API `http://127.0.0.1:3001` — `/api/health/live` + `/api/health/ready` 200 (DB up).
   - Web `http://127.0.0.1:3000` — `/` y `/login` 200.
5. Demo: `gerencia@nexara.com.mx` / `Nexara!NX001`

### Verificar (manual Adam)

- `/erp/users` → editar Juanito → cambiar Actividades a Entrega → guardar → re-login y ver menú OPS.
- Rol sigue siendo techo.

### A medias / siguiente

- Opcional: mismo árbol al editar plantillas de rol (ola 2).
- Ampliar privilegios por encima del rol = no en esta ola.
- `/api/health` full puede 500 en local si Redis/disk fallan; usar `/live` + `/ready`.

## No tocar

Puente NAS. Credenciales. Plan acomodado. No fingir EN VIVO.
Docker Desktop opcional (Postgres Windows ya cubre local).
