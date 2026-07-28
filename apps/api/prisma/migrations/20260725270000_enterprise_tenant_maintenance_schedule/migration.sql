-- MaintenanceSchedule tenant stamp

ALTER TABLE "maintenance_schedules" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_id IS NOT NULL THEN
    UPDATE "maintenance_schedules" ms
      SET "companyId" = COALESCE(
        (SELECT a."companyId" FROM "assets" a WHERE a.id = ms."assetId"),
        primary_id
      )
      WHERE ms."companyId" IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "company_profile" LIMIT 1) THEN
    ALTER TABLE "maintenance_schedules" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_schedules_companyId_fkey') THEN
    ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "maintenance_schedules_companyId_idx" ON "maintenance_schedules"("companyId");
