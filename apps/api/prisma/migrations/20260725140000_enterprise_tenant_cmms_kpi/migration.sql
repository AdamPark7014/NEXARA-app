-- Enterprise Iter: tenant stamp for CMMS + BI KPIs

ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "maintenance_orders" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "kpi_snapshots" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_id IS NOT NULL THEN
    UPDATE "assets" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "maintenance_orders" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    -- Product KPIs inherit primary; public traffic stays null
    UPDATE "kpi_snapshots"
      SET "companyId" = primary_id
      WHERE "companyId" IS NULL
        AND "kpiCategory" <> 'PUBLIC_TRAFFIC';
  END IF;
END $$;

-- Only enforce NOT NULL if there is at least one company (fresh installs may be empty)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "company_profile" LIMIT 1) THEN
    ALTER TABLE "assets" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "maintenance_orders" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assets_companyId_fkey'
  ) THEN
    ALTER TABLE "assets"
      ADD CONSTRAINT "assets_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_orders_companyId_fkey'
  ) THEN
    ALTER TABLE "maintenance_orders"
      ADD CONSTRAINT "maintenance_orders_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kpi_snapshots_companyId_fkey'
  ) THEN
    ALTER TABLE "kpi_snapshots"
      ADD CONSTRAINT "kpi_snapshots_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "assets_companyId_idx" ON "assets"("companyId");
CREATE INDEX IF NOT EXISTS "maintenance_orders_companyId_idx" ON "maintenance_orders"("companyId");
CREATE INDEX IF NOT EXISTS "kpi_snapshots_companyId_idx" ON "kpi_snapshots"("companyId");
