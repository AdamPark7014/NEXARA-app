-- SalesTarget, PurchaseRequisition, ToolKitAssignment, Safety/Training stamps

ALTER TABLE "sales_targets" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "purchase_requisitions" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "tool_kit_assignments" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "safety_incidents" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "work_permits" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "training_records" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_id IS NOT NULL THEN
    UPDATE "sales_targets" st
      SET "companyId" = COALESCE(
        (SELECT uc."companyId" FROM "user_companies" uc WHERE uc."userId" = st."ownerId" ORDER BY uc."isDefault" DESC, uc.id ASC LIMIT 1),
        primary_id
      )
      WHERE st."companyId" IS NULL;

    UPDATE "purchase_requisitions" pr
      SET "companyId" = COALESCE(
        (SELECT d."companyId" FROM "Department" d WHERE d.id = pr."departmentId"),
        (SELECT uc."companyId" FROM "user_companies" uc WHERE uc."userId" = pr."requestedById" ORDER BY uc."isDefault" DESC, uc.id ASC LIMIT 1),
        primary_id
      )
      WHERE pr."companyId" IS NULL;

    UPDATE "tool_kit_assignments" tka
      SET "companyId" = COALESCE(
        (SELECT ti."companyId" FROM "tool_inventory_items" ti WHERE ti.id = tka."inventoryItemId"),
        primary_id
      )
      WHERE tka."companyId" IS NULL;

    UPDATE "safety_incidents" si
      SET "companyId" = COALESCE(
        (SELECT uc."companyId" FROM "user_companies" uc WHERE uc."userId" = si."reportedById" ORDER BY uc."isDefault" DESC, uc.id ASC LIMIT 1),
        primary_id
      )
      WHERE si."companyId" IS NULL;

    UPDATE "work_permits" wp
      SET "companyId" = COALESCE(
        (SELECT uc."companyId" FROM "user_companies" uc WHERE uc."userId" = wp."requestedById" ORDER BY uc."isDefault" DESC, uc.id ASC LIMIT 1),
        primary_id
      )
      WHERE wp."companyId" IS NULL;

    UPDATE "training_records" tr
      SET "companyId" = COALESCE(
        (SELECT uc."companyId" FROM "user_companies" uc WHERE uc."userId" = tr."userId" ORDER BY uc."isDefault" DESC, uc.id ASC LIMIT 1),
        primary_id
      )
      WHERE tr."companyId" IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "company_profile" LIMIT 1) THEN
    ALTER TABLE "sales_targets" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "purchase_requisitions" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "tool_kit_assignments" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "safety_incidents" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "work_permits" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "training_records" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_targets_ownerId_period_year_month_quarter_key') THEN
    ALTER TABLE "sales_targets" DROP CONSTRAINT "sales_targets_ownerId_period_year_month_quarter_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_requisitions_reqNumber_key') THEN
    ALTER TABLE "purchase_requisitions" DROP CONSTRAINT "purchase_requisitions_reqNumber_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'safety_incidents_incidentNumber_key') THEN
    ALTER TABLE "safety_incidents" DROP CONSTRAINT "safety_incidents_incidentNumber_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_permits_permitNumber_key') THEN
    ALTER TABLE "work_permits" DROP CONSTRAINT "work_permits_permitNumber_key";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_targets_companyId_fkey') THEN
    ALTER TABLE "sales_targets" ADD CONSTRAINT "sales_targets_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_requisitions_companyId_fkey') THEN
    ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tool_kit_assignments_companyId_fkey') THEN
    ALTER TABLE "tool_kit_assignments" ADD CONSTRAINT "tool_kit_assignments_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'safety_incidents_companyId_fkey') THEN
    ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_permits_companyId_fkey') THEN
    ALTER TABLE "work_permits" ADD CONSTRAINT "work_permits_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_records_companyId_fkey') THEN
    ALTER TABLE "training_records" ADD CONSTRAINT "training_records_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "sales_targets_companyId_ownerId_period_year_month_quarter_key"
  ON "sales_targets"("companyId", "ownerId", "period", "year", "month", "quarter");
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_requisitions_companyId_reqNumber_key"
  ON "purchase_requisitions"("companyId", "reqNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "safety_incidents_companyId_incidentNumber_key"
  ON "safety_incidents"("companyId", "incidentNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "work_permits_companyId_permitNumber_key"
  ON "work_permits"("companyId", "permitNumber");

CREATE INDEX IF NOT EXISTS "sales_targets_companyId_idx" ON "sales_targets"("companyId");
CREATE INDEX IF NOT EXISTS "purchase_requisitions_companyId_idx" ON "purchase_requisitions"("companyId");
CREATE INDEX IF NOT EXISTS "tool_kit_assignments_companyId_idx" ON "tool_kit_assignments"("companyId");
CREATE INDEX IF NOT EXISTS "safety_incidents_companyId_idx" ON "safety_incidents"("companyId");
CREATE INDEX IF NOT EXISTS "work_permits_companyId_idx" ON "work_permits"("companyId");
CREATE INDEX IF NOT EXISTS "training_records_companyId_idx" ON "training_records"("companyId");
