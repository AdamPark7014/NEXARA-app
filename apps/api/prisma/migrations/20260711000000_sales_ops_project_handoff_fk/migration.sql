-- SalesProject ↔ OperationalProject: FK real + contrato de mantenimiento con proyecto dedicado

-- Orphans: desvincular salesProjectId inválidos antes del FK
UPDATE "operational_projects" op
SET "salesProjectId" = NULL
WHERE "salesProjectId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "sales_projects" sp WHERE sp."id" = op."salesProjectId"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'operational_projects_salesProjectId_fkey'
  ) THEN
    ALTER TABLE "operational_projects"
      ADD CONSTRAINT "operational_projects_salesProjectId_fkey"
      FOREIGN KEY ("salesProjectId") REFERENCES "sales_projects"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "maintenance_contracts"
  ADD COLUMN IF NOT EXISTS "operationalProjectId" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_contracts_operationalProjectId_key"
  ON "maintenance_contracts"("operationalProjectId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_contracts_operationalProjectId_fkey'
  ) THEN
    ALTER TABLE "maintenance_contracts"
      ADD CONSTRAINT "maintenance_contracts_operationalProjectId_fkey"
      FOREIGN KEY ("operationalProjectId") REFERENCES "operational_projects"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
