-- LocationTracking + SalesProjectOrder.companyId

ALTER TABLE "LocationTracking" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "sales_project_orders" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;

  IF primary_id IS NOT NULL THEN
    UPDATE "LocationTracking" lt
      SET "companyId" = COALESCE(
        (SELECT a."companyId" FROM "Activity" a WHERE a.id = lt."actividadId"),
        (
          SELECT uc."companyId" FROM "user_companies" uc
          WHERE uc."userId" = lt."usuarioId"
          ORDER BY uc."isDefault" DESC, uc.id ASC
          LIMIT 1
        ),
        primary_id
      )
      WHERE lt."companyId" IS NULL;

    UPDATE "sales_project_orders" o
      SET "companyId" = COALESCE(
        (SELECT p."companyId" FROM "sales_projects" p WHERE p.id = o."projectId"),
        primary_id
      )
      WHERE o."companyId" IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "company_profile" LIMIT 1) THEN
    ALTER TABLE "LocationTracking" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "sales_project_orders" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LocationTracking_companyId_fkey') THEN
    ALTER TABLE "LocationTracking" ADD CONSTRAINT "LocationTracking_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_project_orders_companyId_fkey') THEN
    ALTER TABLE "sales_project_orders" ADD CONSTRAINT "sales_project_orders_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "LocationTracking_companyId_idx" ON "LocationTracking"("companyId");
CREATE INDEX IF NOT EXISTS "sales_project_orders_companyId_idx" ON "sales_project_orders"("companyId");
