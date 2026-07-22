-- Iter 11: tenant scope Activity / ServiceClient / OperationalProject / Product / CRM masters

-- Add nullable columns first
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "service_clients" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "operational_projects" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "sales_clients" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "sales_leads" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_id IS NOT NULL THEN
    UPDATE "Product" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "Activity" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "service_clients" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "operational_projects" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "sales_clients" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "sales_leads" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "cotizaciones" SET "companyId" = primary_id WHERE "companyId" IS NULL;
  END IF;
END $$;

ALTER TABLE "Product" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Activity" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "service_clients" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "operational_projects" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "sales_clients" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "sales_leads" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "cotizaciones" ALTER COLUMN "companyId" SET NOT NULL;

-- Product: global SKU unique → per-tenant unique
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_sku_key";
DROP INDEX IF EXISTS "Product_sku_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Product_companyId_sku_key" ON "Product"("companyId", "sku");

CREATE INDEX IF NOT EXISTS "Product_companyId_idx" ON "Product"("companyId");
CREATE INDEX IF NOT EXISTS "Activity_companyId_idx" ON "Activity"("companyId");
CREATE INDEX IF NOT EXISTS "service_clients_companyId_idx" ON "service_clients"("companyId");
CREATE INDEX IF NOT EXISTS "operational_projects_companyId_idx" ON "operational_projects"("companyId");
CREATE INDEX IF NOT EXISTS "sales_clients_companyId_idx" ON "sales_clients"("companyId");
CREATE INDEX IF NOT EXISTS "sales_leads_companyId_idx" ON "sales_leads"("companyId");
CREATE INDEX IF NOT EXISTS "cotizaciones_companyId_idx" ON "cotizaciones"("companyId");

DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Activity" ADD CONSTRAINT "Activity_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "service_clients" ADD CONSTRAINT "service_clients_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "operational_projects" ADD CONSTRAINT "operational_projects_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "sales_clients" ADD CONSTRAINT "sales_clients_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "sales_leads" ADD CONSTRAINT "sales_leads_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
