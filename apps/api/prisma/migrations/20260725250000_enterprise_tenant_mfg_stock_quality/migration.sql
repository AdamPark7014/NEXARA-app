-- Manufacturing + warehouse inventory tenant stamps

ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "supplier_evaluations" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "bills_of_materials" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "work_centers" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "production_orders" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "quality_inspections" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "non_conformance_reports" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_id IS NOT NULL THEN
    UPDATE "stock_movements" sm
      SET "companyId" = COALESCE(
        (SELECT w."companyId" FROM "warehouses" w WHERE w.id = sm."fromWarehouseId"),
        (SELECT w."companyId" FROM "warehouses" w WHERE w.id = sm."toWarehouseId"),
        (SELECT p."companyId" FROM "Product" p WHERE p.id = sm."productId"),
        primary_id
      )
      WHERE sm."companyId" IS NULL;

    UPDATE "lots" l
      SET "companyId" = COALESCE(
        (SELECT p."companyId" FROM "Product" p WHERE p.id = l."productId"),
        primary_id
      )
      WHERE l."companyId" IS NULL;

    UPDATE "supplier_evaluations" se
      SET "companyId" = COALESCE(
        (SELECT s."companyId" FROM "suppliers" s WHERE s.id = se."supplierId"),
        primary_id
      )
      WHERE se."companyId" IS NULL;

    UPDATE "bills_of_materials" bom
      SET "companyId" = COALESCE(
        (SELECT p."companyId" FROM "Product" p WHERE p.id = bom."productId"),
        primary_id
      )
      WHERE bom."companyId" IS NULL;

    UPDATE "work_centers" SET "companyId" = primary_id WHERE "companyId" IS NULL;

    UPDATE "production_orders" po
      SET "companyId" = COALESCE(
        (SELECT bom."companyId" FROM "bills_of_materials" bom WHERE bom.id = po."bomId"),
        (SELECT p."companyId" FROM "Product" p WHERE p.id = po."productId"),
        primary_id
      )
      WHERE po."companyId" IS NULL;

    UPDATE "quality_inspections" qi
      SET "companyId" = COALESCE(
        (SELECT p."companyId" FROM "Product" p WHERE p.id = qi."productId"),
        (SELECT l."companyId" FROM "lots" l WHERE l.id = qi."lotId"),
        (SELECT po."companyId" FROM "production_orders" po WHERE po.id = qi."productionOrderId"),
        primary_id
      )
      WHERE qi."companyId" IS NULL;

    UPDATE "non_conformance_reports" ncr
      SET "companyId" = COALESCE(
        (SELECT qi."companyId" FROM "quality_inspections" qi WHERE qi.id = ncr."inspectionId"),
        (SELECT p."companyId" FROM "Product" p WHERE p.id = ncr."productId"),
        primary_id
      )
      WHERE ncr."companyId" IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "company_profile" LIMIT 1) THEN
    ALTER TABLE "stock_movements" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "lots" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "supplier_evaluations" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "bills_of_materials" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "work_centers" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "production_orders" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "quality_inspections" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "non_conformance_reports" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_movementNumber_key') THEN
    ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_movementNumber_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lots_lotNumber_key') THEN
    ALTER TABLE "lots" DROP CONSTRAINT "lots_lotNumber_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bills_of_materials_productId_version_key') THEN
    ALTER TABLE "bills_of_materials" DROP CONSTRAINT "bills_of_materials_productId_version_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_centers_code_key') THEN
    ALTER TABLE "work_centers" DROP CONSTRAINT "work_centers_code_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_orders_orderNumber_key') THEN
    ALTER TABLE "production_orders" DROP CONSTRAINT "production_orders_orderNumber_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quality_inspections_inspectionNumber_key') THEN
    ALTER TABLE "quality_inspections" DROP CONSTRAINT "quality_inspections_inspectionNumber_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'non_conformance_reports_ncrNumber_key') THEN
    ALTER TABLE "non_conformance_reports" DROP CONSTRAINT "non_conformance_reports_ncrNumber_key";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_companyId_fkey') THEN
    ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lots_companyId_fkey') THEN
    ALTER TABLE "lots" ADD CONSTRAINT "lots_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_evaluations_companyId_fkey') THEN
    ALTER TABLE "supplier_evaluations" ADD CONSTRAINT "supplier_evaluations_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bills_of_materials_companyId_fkey') THEN
    ALTER TABLE "bills_of_materials" ADD CONSTRAINT "bills_of_materials_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_centers_companyId_fkey') THEN
    ALTER TABLE "work_centers" ADD CONSTRAINT "work_centers_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_orders_companyId_fkey') THEN
    ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quality_inspections_companyId_fkey') THEN
    ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'non_conformance_reports_companyId_fkey') THEN
    ALTER TABLE "non_conformance_reports" ADD CONSTRAINT "non_conformance_reports_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "stock_movements_companyId_movementNumber_key"
  ON "stock_movements"("companyId", "movementNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "lots_companyId_lotNumber_key"
  ON "lots"("companyId", "lotNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "bills_of_materials_companyId_productId_version_key"
  ON "bills_of_materials"("companyId", "productId", "version");
CREATE UNIQUE INDEX IF NOT EXISTS "work_centers_companyId_code_key"
  ON "work_centers"("companyId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "production_orders_companyId_orderNumber_key"
  ON "production_orders"("companyId", "orderNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "quality_inspections_companyId_inspectionNumber_key"
  ON "quality_inspections"("companyId", "inspectionNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "non_conformance_reports_companyId_ncrNumber_key"
  ON "non_conformance_reports"("companyId", "ncrNumber");

CREATE INDEX IF NOT EXISTS "stock_movements_companyId_idx" ON "stock_movements"("companyId");
CREATE INDEX IF NOT EXISTS "lots_companyId_idx" ON "lots"("companyId");
CREATE INDEX IF NOT EXISTS "supplier_evaluations_companyId_idx" ON "supplier_evaluations"("companyId");
CREATE INDEX IF NOT EXISTS "bills_of_materials_companyId_idx" ON "bills_of_materials"("companyId");
CREATE INDEX IF NOT EXISTS "work_centers_companyId_idx" ON "work_centers"("companyId");
CREATE INDEX IF NOT EXISTS "production_orders_companyId_idx" ON "production_orders"("companyId");
CREATE INDEX IF NOT EXISTS "quality_inspections_companyId_idx" ON "quality_inspections"("companyId");
CREATE INDEX IF NOT EXISTS "non_conformance_reports_companyId_idx" ON "non_conformance_reports"("companyId");
