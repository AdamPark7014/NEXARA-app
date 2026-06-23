-- ============================================================================
-- RRHH v1 — Campos de Recursos Humanos en modelo User
-- ============================================================================
-- Agrega campos para gestión de plantilla directamente en el modelo User:
--   puesto       → cargo / título del puesto
--   tipoContrato → Planta | Honorarios | Contratista
--   estadoRRHH   → Activo | Vacaciones | Incidencia | Baja
--   isActive     → empleado activo en sistema (diferente a estado RRHH)
--   fechaIngreso → fecha real de inicio (distinto a fechaCreacion de cuenta)
-- IF NOT EXISTS en todas las operaciones — migracion idempotente.
-- ============================================================================

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "puesto"       VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "tipoContrato" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "estadoRRHH"   VARCHAR(30) NOT NULL DEFAULT 'Activo',
  ADD COLUMN IF NOT EXISTS "isActive"     BOOLEAN     NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "fechaIngreso" TIMESTAMP;

CREATE INDEX IF NOT EXISTS "User_isActive_idx"    ON "User"("isActive");
CREATE INDEX IF NOT EXISTS "User_estadoRRHH_idx"  ON "User"("estadoRRHH");
