-- Viáticos: origen solicitud vs asignación + quién asignó
ALTER TABLE "viaticos"
  ADD COLUMN IF NOT EXISTS "origen" VARCHAR(20) NOT NULL DEFAULT 'SOLICITUD',
  ADD COLUMN IF NOT EXISTS "asignadoPorId" INTEGER;

CREATE INDEX IF NOT EXISTS "viaticos_origen_fechaSolicitud_idx"
  ON "viaticos"("origen", "fechaSolicitud");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'viaticos_asignadoPorId_fkey'
  ) THEN
    ALTER TABLE "viaticos"
      ADD CONSTRAINT "viaticos_asignadoPorId_fkey"
      FOREIGN KEY ("asignadoPorId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Rol CEO: quitar etiqueta informal "Dueño"
UPDATE "Role"
SET "nombre" = 'CEO'
WHERE "orgRoleKey" = 'ceo'
   OR "nombre" ILIKE '%Dueño%CEO%'
   OR "nombre" = 'Dueño / CEO';
