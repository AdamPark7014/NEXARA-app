-- Libera employeeNumber de cuentas legacy inactivas (no borra filas).
-- Ejecutar ANTES del seed si hubo duplicados onboarding.

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

-- Opcional: eliminar definitivamente (solo si no tienen FKs)
-- DELETE FROM "User" WHERE "isActive" = false AND LOWER(email) LIKE '%.%@%';
