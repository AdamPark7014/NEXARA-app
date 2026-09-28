-- Reserva módulos de una empresa a ciertos roles (política `rbac.module_roles`).
-- Solo esa empresa: las demás siguen con la matriz global.
--
--   psql -v company_id=<id de company_profile> -f set-module-policy.sql
--
-- Cambia la lista de roles en el JSON para ajustar quién lo ve. Para quitar la restricción:
--   DELETE FROM system_settings WHERE key = 'rbac.module_roles' AND "companyId" = <id>;
-- El API relee la política cada 30 s; no hace falta reiniciar.
\set ON_ERROR_STOP on

INSERT INTO system_settings (key, value, category, label, "companyId", "createdAt", "updatedAt")
VALUES (
  'rbac.module_roles',
  '{"employee-payments":["ceo"]}',
  'rbac',
  'Módulos reservados a ciertos roles',
  :company_id,
  now(),
  now()
)
ON CONFLICT (key, "companyId") DO UPDATE
  SET value = EXCLUDED.value, "updatedAt" = now();

SELECT id, key, value, "companyId" FROM system_settings
WHERE key = 'rbac.module_roles' AND "companyId" = :company_id;
