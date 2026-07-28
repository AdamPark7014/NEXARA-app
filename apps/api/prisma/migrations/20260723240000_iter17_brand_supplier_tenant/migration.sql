-- Iter 17: Brand + Supplier tenant

DO $$
DECLARE
  primary_cid INTEGER;
BEGIN
  SELECT id INTO primary_cid FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_cid IS NULL THEN
    SELECT id INTO primary_cid FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_cid IS NULL THEN
    RAISE EXCEPTION 'No company_profile for Brand/Supplier backfill';
  END IF;

  ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
  UPDATE "brands" SET "companyId" = primary_cid WHERE "companyId" IS NULL;
  ALTER TABLE "brands" ALTER COLUMN "companyId" SET NOT NULL;

  ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
  UPDATE "suppliers" SET "companyId" = primary_cid WHERE "companyId" IS NULL;
  ALTER TABLE "suppliers" ALTER COLUMN "companyId" SET NOT NULL;

  ALTER TABLE "brands" DROP CONSTRAINT IF EXISTS "brands_name_key";
  ALTER TABLE "brands" DROP CONSTRAINT IF EXISTS "brands_normalized_key";
  DROP INDEX IF EXISTS "brands_name_key";
  DROP INDEX IF EXISTS "brands_normalized_key";

  ALTER TABLE "suppliers" DROP CONSTRAINT IF EXISTS "suppliers_name_key";
  DROP INDEX IF EXISTS "suppliers_name_key";

  CREATE UNIQUE INDEX IF NOT EXISTS "brands_companyId_name_key" ON "brands"("companyId", "name");
  CREATE UNIQUE INDEX IF NOT EXISTS "brands_companyId_normalized_key" ON "brands"("companyId", "normalized");
  CREATE INDEX IF NOT EXISTS "brands_companyId_idx" ON "brands"("companyId");

  CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_companyId_name_key" ON "suppliers"("companyId", "name");
  CREATE INDEX IF NOT EXISTS "suppliers_companyId_idx" ON "suppliers"("companyId");

  BEGIN
    ALTER TABLE "brands" ADD CONSTRAINT "brands_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
