-- Iter 13: Chat + Maintenance + Finance masters tenant

ALTER TABLE "chat_channels" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "maintenance_contracts" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "fiscal_periods" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_id IS NULL THEN
    INSERT INTO "company_profile" ("legalName", "rfc", "isPrimary", "isActive", "createdAt", "updatedAt")
    VALUES ('NEXARA', 'XAXX010101000', true, true, NOW(), NOW())
    RETURNING id INTO primary_id;
  END IF;

  UPDATE "chat_channels" SET "companyId" = primary_id WHERE "companyId" IS NULL;
  UPDATE "maintenance_contracts" SET "companyId" = primary_id WHERE "companyId" IS NULL;
  UPDATE "accounts" SET "companyId" = primary_id WHERE "companyId" IS NULL;
  UPDATE "fiscal_periods" SET "companyId" = primary_id WHERE "companyId" IS NULL;
  UPDATE "bank_accounts" SET "companyId" = primary_id WHERE "companyId" IS NULL;
END $$;

ALTER TABLE "chat_channels" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "maintenance_contracts" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "accounts" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "fiscal_periods" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "bank_accounts" ALTER COLUMN "companyId" SET NOT NULL;

-- Chat: global slug/dmKey → per-tenant
ALTER TABLE "chat_channels" DROP CONSTRAINT IF EXISTS "chat_channels_slug_key";
DROP INDEX IF EXISTS "chat_channels_slug_key";
ALTER TABLE "chat_channels" DROP CONSTRAINT IF EXISTS "chat_channels_dmKey_key";
DROP INDEX IF EXISTS "chat_channels_dmKey_key";
CREATE UNIQUE INDEX IF NOT EXISTS "chat_channels_companyId_slug_key"
  ON "chat_channels"("companyId", "slug") WHERE "slug" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "chat_channels_companyId_dmKey_key"
  ON "chat_channels"("companyId", "dmKey") WHERE "dmKey" IS NOT NULL;

-- Accounts: global code → per-tenant
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_code_key";
DROP INDEX IF EXISTS "accounts_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_companyId_code_key" ON "accounts"("companyId", "code");

-- Fiscal periods: range unique per tenant
ALTER TABLE "fiscal_periods" DROP CONSTRAINT IF EXISTS "fiscal_periods_startDate_endDate_key";
DROP INDEX IF EXISTS "fiscal_periods_startDate_endDate_key";
CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_periods_companyId_startDate_endDate_key"
  ON "fiscal_periods"("companyId", "startDate", "endDate");

CREATE INDEX IF NOT EXISTS "chat_channels_companyId_idx" ON "chat_channels"("companyId");
CREATE INDEX IF NOT EXISTS "maintenance_contracts_companyId_idx" ON "maintenance_contracts"("companyId");
CREATE INDEX IF NOT EXISTS "accounts_companyId_idx" ON "accounts"("companyId");
CREATE INDEX IF NOT EXISTS "fiscal_periods_companyId_idx" ON "fiscal_periods"("companyId");
CREATE INDEX IF NOT EXISTS "bank_accounts_companyId_idx" ON "bank_accounts"("companyId");

DO $$ BEGIN
  ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "maintenance_contracts" ADD CONSTRAINT "maintenance_contracts_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "accounts" ADD CONSTRAINT "accounts_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
