-- Iter 15: CostCenter + VehicleAsset tenant

DO $$
DECLARE
  primary_cid INTEGER;
BEGIN
  SELECT id INTO primary_cid FROM "company_profile" ORDER BY id ASC LIMIT 1;
  IF primary_cid IS NULL THEN
    RAISE EXCEPTION 'No company_profile row for tenant backfill';
  END IF;

  -- Cost centers
  ALTER TABLE "cost_centers" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
  UPDATE "cost_centers" SET "companyId" = primary_cid WHERE "companyId" IS NULL;
  ALTER TABLE "cost_centers" ALTER COLUMN "companyId" SET NOT NULL;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cost_centers_code_key'
  ) THEN
    ALTER TABLE "cost_centers" DROP CONSTRAINT "cost_centers_code_key";
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS "cost_centers_companyId_code_key"
    ON "cost_centers"("companyId", "code");
  CREATE INDEX IF NOT EXISTS "cost_centers_companyId_idx" ON "cost_centers"("companyId");

  BEGIN
    ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Vehicle assets (table name is "VehicleAsset")
  ALTER TABLE "VehicleAsset" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
  UPDATE "VehicleAsset" SET "companyId" = primary_cid WHERE "companyId" IS NULL;
  ALTER TABLE "VehicleAsset" ALTER COLUMN "companyId" SET NOT NULL;
  CREATE INDEX IF NOT EXISTS "VehicleAsset_companyId_idx" ON "VehicleAsset"("companyId");

  BEGIN
    ALTER TABLE "VehicleAsset" ADD CONSTRAINT "VehicleAsset_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
