-- Borrado lógico de actividades: quién la eliminó.
-- `deletedAt` ya existía. Esta migración solo agrega `deletedById`.
-- La fila se conserva; pizarra, Mi equipo, listas, KPIs y búsquedas
-- filtran deletedAt IS NULL.

ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "deletedById" INTEGER;

DO $$ BEGIN
  ALTER TABLE "Activity"
    ADD CONSTRAINT "Activity_deletedById_fkey"
    FOREIGN KEY ("deletedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Activity_deletedById_idx"
  ON "Activity"("deletedById");
