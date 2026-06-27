-- Libera employeeNumber de cuentas legacy inactivas (no borra filas).
-- Ejecutar ANTES del seed si hubo duplicados onboarding.
--
-- En servidor:
--   cat apps/api/scripts/cleanup-ghost-users.sql | docker exec -i nexara-db psql -U nexara_user -d nexara_db

UPDATE "User"
SET "employeeNumber" = NULL
WHERE "isActive" = false
  AND LOWER(email) IN (
    'monica.garcia@nexara.com.mx',
    'direction.operaciones@nexara.com.mx',
    'jose.tapa@nexara.com.mx',
    'juan.carrillo@nexara.com.mx',
    'maria.sanchez@nexara.com.mx',
    'daniela.arevez@nexara.com.mx',
    'juana.sierra@nexara.com.mx',
    'maria.gonzalez@nexara.com.mx',
    'melisa.ramos@nexara.com.mx'
  );

-- Rol que falta en migración SQL original
INSERT INTO "Role" (nombre, "orgRoleKey")
SELECT 'Ingeniero de Soporte', 'ing_soporte'
WHERE NOT EXISTS (SELECT 1 FROM "Role" WHERE "orgRoleKey" = 'ing_soporte');

-- Opcional: eliminar definitivamente (solo si no tienen FKs)
-- DELETE FROM "User" WHERE "isActive" = false AND LOWER(email) LIKE '%.%@%';
