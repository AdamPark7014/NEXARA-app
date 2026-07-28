-- Ops/HR/Sales tenant stamps: WorkProject, CvCandidate, Fine, Tools, SalesProject, OrderTemplate, PageContentRevision

ALTER TABLE "work_projects" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "CvCandidate" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "fines" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "tool_requests" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "tool_inventory_items" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "sales_projects" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "order_templates" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "page_content_revisions" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_id IS NOT NULL THEN
    UPDATE "work_projects" SET "companyId" = primary_id WHERE "companyId" IS NULL;

    UPDATE "CvCandidate" cv
      SET "companyId" = COALESCE(
        (SELECT uc."companyId" FROM "user_companies" uc WHERE uc."userId" = cv."createdById" ORDER BY uc."isDefault" DESC, uc.id ASC LIMIT 1),
        primary_id
      )
      WHERE cv."companyId" IS NULL;

    UPDATE "fines" f
      SET "companyId" = COALESCE(
        (SELECT uc."companyId" FROM "user_companies" uc WHERE uc."userId" = f."usuarioId" ORDER BY uc."isDefault" DESC, uc.id ASC LIMIT 1),
        primary_id
      )
      WHERE f."companyId" IS NULL;

    UPDATE "tool_inventory_items" SET "companyId" = primary_id WHERE "companyId" IS NULL;

    UPDATE "tool_requests" tr
      SET "companyId" = COALESCE(
        (SELECT ti."companyId" FROM "tool_inventory_items" ti WHERE ti.id = tr."inventoryItemId"),
        (SELECT uc."companyId" FROM "user_companies" uc WHERE uc."userId" = tr."usuarioId" ORDER BY uc."isDefault" DESC, uc.id ASC LIMIT 1),
        primary_id
      )
      WHERE tr."companyId" IS NULL;

    UPDATE "sales_projects" sp
      SET "companyId" = COALESCE(
        (SELECT so."companyId" FROM "sales_opportunities" so WHERE so.id = sp."opportunityId"),
        primary_id
      )
      WHERE sp."companyId" IS NULL;

    UPDATE "order_templates" SET "companyId" = primary_id WHERE "companyId" IS NULL;

    UPDATE "page_content_revisions" pcr
      SET "companyId" = COALESCE(
        (SELECT pc."companyId" FROM "page_content" pc WHERE pc.section = pcr.section ORDER BY pc.id ASC LIMIT 1),
        primary_id
      )
      WHERE pcr."companyId" IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "company_profile" LIMIT 1) THEN
    ALTER TABLE "work_projects" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "CvCandidate" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "fines" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "tool_requests" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "tool_inventory_items" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "sales_projects" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "order_templates" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "page_content_revisions" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tool_inventory_items_serialNumber_key') THEN
    ALTER TABLE "tool_inventory_items" DROP CONSTRAINT "tool_inventory_items_serialNumber_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'page_content_revisions_section_version_key') THEN
    ALTER TABLE "page_content_revisions" DROP CONSTRAINT "page_content_revisions_section_version_key";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_projects_companyId_fkey') THEN
    ALTER TABLE "work_projects" ADD CONSTRAINT "work_projects_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CvCandidate_companyId_fkey') THEN
    ALTER TABLE "CvCandidate" ADD CONSTRAINT "CvCandidate_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fines_companyId_fkey') THEN
    ALTER TABLE "fines" ADD CONSTRAINT "fines_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tool_requests_companyId_fkey') THEN
    ALTER TABLE "tool_requests" ADD CONSTRAINT "tool_requests_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tool_inventory_items_companyId_fkey') THEN
    ALTER TABLE "tool_inventory_items" ADD CONSTRAINT "tool_inventory_items_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_projects_companyId_fkey') THEN
    ALTER TABLE "sales_projects" ADD CONSTRAINT "sales_projects_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_templates_companyId_fkey') THEN
    ALTER TABLE "order_templates" ADD CONSTRAINT "order_templates_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'page_content_revisions_companyId_fkey') THEN
    ALTER TABLE "page_content_revisions" ADD CONSTRAINT "page_content_revisions_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "tool_inventory_items_companyId_serialNumber_key"
  ON "tool_inventory_items"("companyId", "serialNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "page_content_revisions_companyId_section_version_key"
  ON "page_content_revisions"("companyId", "section", "version");

CREATE INDEX IF NOT EXISTS "work_projects_companyId_idx" ON "work_projects"("companyId");
CREATE INDEX IF NOT EXISTS "CvCandidate_companyId_idx" ON "CvCandidate"("companyId");
CREATE INDEX IF NOT EXISTS "fines_companyId_idx" ON "fines"("companyId");
CREATE INDEX IF NOT EXISTS "tool_requests_companyId_idx" ON "tool_requests"("companyId");
CREATE INDEX IF NOT EXISTS "tool_inventory_items_companyId_idx" ON "tool_inventory_items"("companyId");
CREATE INDEX IF NOT EXISTS "sales_projects_companyId_idx" ON "sales_projects"("companyId");
CREATE INDEX IF NOT EXISTS "order_templates_companyId_idx" ON "order_templates"("companyId");
CREATE INDEX IF NOT EXISTS "page_content_revisions_companyId_idx" ON "page_content_revisions"("companyId");
