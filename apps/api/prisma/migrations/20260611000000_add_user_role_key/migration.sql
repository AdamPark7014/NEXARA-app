-- ============================================================================
-- RBAC v2 — Agrega columna User.roleKey
-- ============================================================================
-- El schema.prisma ya declaraba `roleKey String? @db.VarChar(40)` en el
-- modelo User (apps/api/prisma/schema.prisma:424) y los servicios de auth lo
-- consumen al hacer login (auth.service.ts:341, jwt.strategy.ts:69), pero la
-- migración SQL nunca se generó. Esto provocaba el error en producción:
--   "The column `User.roleKey` does not exist in the current database."
-- ============================================================================

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "roleKey" VARCHAR(40);

CREATE INDEX IF NOT EXISTS "User_roleKey_idx" ON "User"("roleKey");
