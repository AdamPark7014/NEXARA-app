-- Quién puede dar de alta usuarios de qué tipo en UNA empresa (política `users.creation_grants`).
--
--   psql -v company_id=<id de company_profile> -f set-user-creation-grants.sql
--
-- Concede por PERSONA (por correo), no por rol: David y Luis comparten rol y no dan de alta lo mismo.
--   Antonio (José Antonio Ramírez)  → soporte           (ing_soporte)
--   Luis    (Luis Joel Aguilar)     → soporte           (ing_soporte)
--   David   (David Morales Zenón)   → instaladores      (ing_campo)
-- Christian (dirección) da de alta TODOS los tipos por debajo de él sin necesitar concesión.
-- Solo se aceptan tipos operativos: ing_soporte, ing_campo, vendedor, disenador, administrativo.
-- Cualquier otro (ceo, dir_*, coord_*, contabilidad, rh…) se ignora aunque se escriba aquí.
--
-- Cada persona nueva queda «debajo» de quien la dio de alta y se registra en la auditoría.
-- Para quitarlo:  DELETE FROM system_settings WHERE key = 'users.creation_grants' AND "companyId" = <id>;
-- El API relee la política cada 30 s.
\set ON_ERROR_STOP on

INSERT INTO system_settings (key, value, category, label, "companyId", "createdAt", "updatedAt")
VALUES (
  'users.creation_grants',
  '{"jose.ramirez@nexara.com.mx":["ing_soporte"],"direccion.operaciones@nexara.com.mx":["ing_soporte"],"operaciones@nexara.com.mx":["ing_campo"]}',
  'users',
  'Quién da de alta a quién',
  :company_id,
  now(),
  now()
)
ON CONFLICT (key, "companyId") DO UPDATE
  SET value = EXCLUDED.value, "updatedAt" = now();

SELECT id, key, value, "companyId" FROM system_settings
WHERE key = 'users.creation_grants' AND "companyId" = :company_id;
