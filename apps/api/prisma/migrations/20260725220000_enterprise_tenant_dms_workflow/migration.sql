-- DMS + Workflow tenant stamps

ALTER TABLE "document_categories" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "managed_documents" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "workflow_definitions" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "workflow_instances" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_id IS NOT NULL THEN
    UPDATE "document_categories" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "managed_documents" md
      SET "companyId" = COALESCE(
        (SELECT uc."companyId" FROM "user_companies" uc WHERE uc."userId" = md."createdById" ORDER BY uc."isDefault" DESC, uc.id ASC LIMIT 1),
        primary_id
      )
      WHERE md."companyId" IS NULL;
    UPDATE "workflow_definitions" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "workflow_instances" wi
      SET "companyId" = COALESCE(
        (SELECT wd."companyId" FROM "workflow_definitions" wd WHERE wd.id = wi."workflowId"),
        (SELECT uc."companyId" FROM "user_companies" uc WHERE uc."userId" = wi."startedById" ORDER BY uc."isDefault" DESC, uc.id ASC LIMIT 1),
        primary_id
      )
      WHERE wi."companyId" IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "company_profile" LIMIT 1) THEN
    ALTER TABLE "document_categories" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "managed_documents" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "workflow_definitions" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "workflow_instances" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_categories_name_key') THEN
    ALTER TABLE "document_categories" DROP CONSTRAINT "document_categories_name_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'managed_documents_documentNumber_key') THEN
    ALTER TABLE "managed_documents" DROP CONSTRAINT "managed_documents_documentNumber_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_definitions_name_key') THEN
    ALTER TABLE "workflow_definitions" DROP CONSTRAINT "workflow_definitions_name_key";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_categories_companyId_fkey') THEN
    ALTER TABLE "document_categories" ADD CONSTRAINT "document_categories_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'managed_documents_companyId_fkey') THEN
    ALTER TABLE "managed_documents" ADD CONSTRAINT "managed_documents_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_definitions_companyId_fkey') THEN
    ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_instances_companyId_fkey') THEN
    ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "document_categories_companyId_name_key"
  ON "document_categories"("companyId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "managed_documents_companyId_documentNumber_key"
  ON "managed_documents"("companyId", "documentNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_definitions_companyId_name_key"
  ON "workflow_definitions"("companyId", "name");

CREATE INDEX IF NOT EXISTS "document_categories_companyId_idx" ON "document_categories"("companyId");
CREATE INDEX IF NOT EXISTS "managed_documents_companyId_idx" ON "managed_documents"("companyId");
CREATE INDEX IF NOT EXISTS "workflow_definitions_companyId_idx" ON "workflow_definitions"("companyId");
CREATE INDEX IF NOT EXISTS "workflow_instances_companyId_idx" ON "workflow_instances"("companyId");
