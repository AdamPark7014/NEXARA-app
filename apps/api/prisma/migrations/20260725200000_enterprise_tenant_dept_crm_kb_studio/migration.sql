-- Department, Client, Project, Tender, CrmActivity, KB tenant stamps

ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "tenders" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "crm_activities" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "kb_categories" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "kb_articles" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_id IS NOT NULL THEN
    -- Prefer user's default company for departments that have users
    UPDATE "Department" d
      SET "companyId" = COALESCE(
        (
          SELECT uc."companyId"
          FROM "User" u
          JOIN "user_companies" uc ON uc."userId" = u.id
          WHERE u."departmentId" = d.id
          ORDER BY uc."isDefault" DESC, uc.id ASC
          LIMIT 1
        ),
        primary_id
      )
      WHERE d."companyId" IS NULL;

    UPDATE "clients" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "projects" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "tenders" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "crm_activities" ca
      SET "companyId" = COALESCE(
        (SELECT sl."companyId" FROM "sales_leads" sl WHERE sl.id = ca."leadId"),
        (SELECT so."companyId" FROM "sales_opportunities" so WHERE so.id = ca."opportunityId"),
        (SELECT t."companyId" FROM "tenders" t WHERE t.id = ca."tenderId"),
        primary_id
      )
      WHERE ca."companyId" IS NULL;
    UPDATE "kb_categories" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "kb_articles" SET "companyId" = primary_id WHERE "companyId" IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "company_profile" LIMIT 1) THEN
    ALTER TABLE "Department" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "clients" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "projects" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "tenders" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "crm_activities" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "kb_categories" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "kb_articles" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Department_nombre_key') THEN
    ALTER TABLE "Department" DROP CONSTRAINT "Department_nombre_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_slug_key') THEN
    ALTER TABLE "projects" DROP CONSTRAINT "projects_slug_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenders_tenderNumber_key') THEN
    ALTER TABLE "tenders" DROP CONSTRAINT "tenders_tenderNumber_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kb_categories_slug_key') THEN
    ALTER TABLE "kb_categories" DROP CONSTRAINT "kb_categories_slug_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kb_articles_slug_key') THEN
    ALTER TABLE "kb_articles" DROP CONSTRAINT "kb_articles_slug_key";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Department_companyId_fkey') THEN
    ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_companyId_fkey') THEN
    ALTER TABLE "clients" ADD CONSTRAINT "clients_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_companyId_fkey') THEN
    ALTER TABLE "projects" ADD CONSTRAINT "projects_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenders_companyId_fkey') THEN
    ALTER TABLE "tenders" ADD CONSTRAINT "tenders_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_activities_companyId_fkey') THEN
    ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kb_categories_companyId_fkey') THEN
    ALTER TABLE "kb_categories" ADD CONSTRAINT "kb_categories_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kb_articles_companyId_fkey') THEN
    ALTER TABLE "kb_articles" ADD CONSTRAINT "kb_articles_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Department_companyId_nombre_key" ON "Department"("companyId", "nombre");
CREATE UNIQUE INDEX IF NOT EXISTS "projects_companyId_slug_key" ON "projects"("companyId", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "tenders_companyId_tenderNumber_key" ON "tenders"("companyId", "tenderNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "kb_categories_companyId_slug_key" ON "kb_categories"("companyId", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "kb_articles_companyId_slug_key" ON "kb_articles"("companyId", "slug");

CREATE INDEX IF NOT EXISTS "Department_companyId_idx" ON "Department"("companyId");
CREATE INDEX IF NOT EXISTS "clients_companyId_idx" ON "clients"("companyId");
CREATE INDEX IF NOT EXISTS "projects_companyId_idx" ON "projects"("companyId");
CREATE INDEX IF NOT EXISTS "tenders_companyId_idx" ON "tenders"("companyId");
CREATE INDEX IF NOT EXISTS "crm_activities_companyId_idx" ON "crm_activities"("companyId");
CREATE INDEX IF NOT EXISTS "kb_categories_companyId_idx" ON "kb_categories"("companyId");
CREATE INDEX IF NOT EXISTS "kb_articles_companyId_idx" ON "kb_articles"("companyId");
