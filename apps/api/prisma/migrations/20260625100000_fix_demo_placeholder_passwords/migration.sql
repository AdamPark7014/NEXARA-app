-- ============================================================================
-- Fix: contraseñas placeholder que bloquean login demo
-- ============================================================================
-- La migración seed_nexara_team insertó un hash bcrypt que NO corresponde a
-- Nexara2026! y la migración update_user_passwords nunca lo corrigió porque
-- buscaba el patrón '%NEXARA.placeholder%' en lugar del hash real.
--
-- Contraseña demo tras esta migración: Nexara2026!
-- ============================================================================

-- Hash bcrypt de "Nexara2026!" (cost 10)
UPDATE "User"
SET "passwordHash" = '$2a$10$nl1ePze.TiLjg1wVeSMPYuVFyqscp8BXrx7r.wuJwUEplqWk3cd8e'
WHERE "passwordHash" = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p6ez6kxOEfRkNpDlHlOYIi';

-- Carolina Juárez — soporte técnico (no ingeniero de campo)
UPDATE "User" u
SET
  "roleKey" = 'ing_soporte',
  "roleId" = COALESCE(
    (SELECT id FROM "Role" WHERE "roleKey" = 'ing_soporte' LIMIT 1),
    (SELECT id FROM "Role" WHERE "orgRoleKey" = 'senior_engineer' LIMIT 1),
    u."roleId"
  ),
  puesto = 'Ingeniera de Soporte'
WHERE u.email = 'soporte@nexara.com.mx';
