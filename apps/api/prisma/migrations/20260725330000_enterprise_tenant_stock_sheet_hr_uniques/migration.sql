-- ServiceSheet / WarehouseLocation / StockLevel companyId + HR day uniques per tenant

ALTER TABLE "service_sheets" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "warehouse_locations" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "stock_levels" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;

  IF primary_id IS NOT NULL THEN
    UPDATE "service_sheets" s
      SET "companyId" = COALESCE(
        (SELECT a."companyId" FROM "Activity" a WHERE a.id = s."activityId"),
        primary_id
      )
      WHERE s."companyId" IS NULL;

    UPDATE "warehouse_locations" l
      SET "companyId" = COALESCE(
        (SELECT w."companyId" FROM "warehouses" w WHERE w.id = l."warehouseId"),
        primary_id
      )
      WHERE l."companyId" IS NULL;

    UPDATE "stock_levels" sl
      SET "companyId" = COALESCE(
        (SELECT w."companyId" FROM "warehouses" w WHERE w.id = sl."warehouseId"),
        (SELECT p."companyId" FROM "Product" p WHERE p.id = sl."productId"),
        primary_id
      )
      WHERE sl."companyId" IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "company_profile" LIMIT 1) THEN
    ALTER TABLE "service_sheets" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "warehouse_locations" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "stock_levels" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_sheets_companyId_fkey') THEN
    ALTER TABLE "service_sheets" ADD CONSTRAINT "service_sheets_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_locations_companyId_fkey') THEN
    ALTER TABLE "warehouse_locations" ADD CONSTRAINT "warehouse_locations_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_levels_companyId_fkey') THEN
    ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "service_sheets_companyId_idx" ON "service_sheets"("companyId");
CREATE INDEX IF NOT EXISTS "warehouse_locations_companyId_idx" ON "warehouse_locations"("companyId");
CREATE INDEX IF NOT EXISTS "stock_levels_companyId_idx" ON "stock_levels"("companyId");

-- AttendanceDay / LunchBreak: unique per tenant
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AttendanceDay_userId_date_key') THEN
    ALTER TABLE "AttendanceDay" DROP CONSTRAINT "AttendanceDay_userId_date_key";
  END IF;
END $$;
DROP INDEX IF EXISTS "AttendanceDay_userId_date_key";
CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceDay_companyId_userId_date_key"
  ON "AttendanceDay"("companyId", "userId", "date");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lunch_breaks_userId_date_key') THEN
    ALTER TABLE "lunch_breaks" DROP CONSTRAINT "lunch_breaks_userId_date_key";
  END IF;
END $$;
DROP INDEX IF EXISTS "lunch_breaks_userId_date_key";
CREATE UNIQUE INDEX IF NOT EXISTS "lunch_breaks_companyId_userId_date_key"
  ON "lunch_breaks"("companyId", "userId", "date");
