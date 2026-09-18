-- José Iván Tapia, Isaías García y Ariadna Sierra ya no deben tener acceso (Adam, 18-09-2026).
-- Las crean migraciones de semilla viejas (20260620120000, 20260622010000); si una base nueva las
-- trae, aquí quedan desactivadas, sin contraseña utilizable y fuera del organigrama.
-- En el servidor actual no existen: no hace nada.
UPDATE "User"
SET "isActive" = false,
    "passwordHash" = '',
    "estadoRRHH" = 'Baja',
    "managerId" = NULL
WHERE email IN (
  'ivan.tapia@nexara.com.mx',
  'isaias.garcia@nexara.com.mx',
  'ariadna.sierra@nexara.com.mx'
);

UPDATE "User"
SET "managerId" = NULL
WHERE "managerId" IN (
  SELECT id FROM "User"
  WHERE email IN ('ivan.tapia@nexara.com.mx', 'isaias.garcia@nexara.com.mx', 'ariadna.sierra@nexara.com.mx')
);
