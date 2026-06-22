-- ============================================================================
-- Migración: Actualizar contraseñas de usuarios nuevos
-- ============================================================================
-- Esta migración actualiza todas las contraseñas placeholder a un hash válido.
-- Contraseña temporal: Nexara2026!
-- Los usuarios deben cambiar su contraseña en el primer login.

-- Actualizar contraseñas de todos los usuarios cuyo email está en la lista de nuevos usuarios
-- Usamos el mismo hash que el CEO (gerencia@nexara.com.mx) para garantizar que funcione

UPDATE "User"
SET "passwordHash" = (
  SELECT "passwordHash" FROM "User" 
  WHERE email = 'gerencia@nexara.com.mx' 
  LIMIT 1
)
WHERE email IN (
  'ivan.tapia@nexara.com.mx',
  'administracion.ventas@nexara.com.mx',
  'isaias.garcia@nexara.com.mx',
  'joan.sanchez@nexara.com.mx',
  'soporte@nexara.com.mx',
  'ariadna.sierra@nexara.com.mx',
  'alejandro.gonzalez@nexara.com.mx',
  'israel.ramos@nexara.com.mx'
)
AND "passwordHash" LIKE '%NEXARA.placeholder%';
