# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-11
- **Rama:** mejora/calidad-y-web
- **HEAD:** (cerrar)

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Este turno — Roles dinámicos (árbol IAM)

### Hecho

1. **Modelo:** `User.moduleAccess` JSON + migración `20260911190000_user_module_access`.
2. **Catálogo UI:** `apps/web/lib/access-tree.ts` — Core/Contabilidad/RRHH/OPS/CRM/Integra/Studio; pares OPS con Supervisa|Entrega|Ambas|Off.
3. **UI:** `UserAccessTree` en `/erp/users` (crear/editar) debajo del rol.
4. **API:** PATCH/create aceptan `moduleAccess`; `GET roles/:id/nav-preview`; `MeService` aplica overrides sin ampliar techo del rol (`module-access-merge.ts`).
5. **Runtime:** `moduleAccess` en sesión/JWT profile; `resolveOpsPairNav` + sidebar respetan overrides (incl. ambas).
6. `tsc` web + api OK.

### Verificar

- Migrar DB: `cd apps/api; npx prisma migrate deploy` (o `migrate dev`).
- `/erp/users` → editar Juanito → cambiar Actividades a Entrega → guardar → re-login Juanito y ver menú OPS.
- Rol sigue siendo techo: no se puede activar Contabilidad si el rol no la tiene.

### A medias / siguiente

- Aplicar migración en local/prod.
- Opcional: mismo árbol al editar plantillas de rol (ola 2).
- Ampliar privilegios por encima del rol = no en esta ola.

## No tocar

Puente NAS. Credenciales. Plan acomodado. No fingir EN VIVO.
