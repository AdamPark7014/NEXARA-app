-- NEXARA P0-C: UserCompany membership + companyId on fiscal entities

CREATE TABLE IF NOT EXISTS "user_companies" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "companyId" INTEGER NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_companies_userId_companyId_key" UNIQUE ("userId", "companyId")
);

CREATE INDEX IF NOT EXISTS "user_companies_companyId_idx" ON "user_companies"("companyId");

DO $$ BEGIN
  ALTER TABLE "user_companies"
    ADD CONSTRAINT "user_companies_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_companies"
    ADD CONSTRAINT "user_companies_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "viaticos" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "employee_payments" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

CREATE INDEX IF NOT EXISTS "Expense_companyId_idx" ON "Expense"("companyId");
CREATE INDEX IF NOT EXISTS "viaticos_companyId_idx" ON "viaticos"("companyId");
CREATE INDEX IF NOT EXISTS "employee_payments_companyId_idx" ON "employee_payments"("companyId");
CREATE INDEX IF NOT EXISTS "journal_entries_companyId_idx" ON "journal_entries"("companyId");
CREATE INDEX IF NOT EXISTS "invoices_companyId_idx" ON "invoices"("companyId");
CREATE INDEX IF NOT EXISTS "purchase_orders_companyId_idx" ON "purchase_orders"("companyId");

DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "viaticos" ADD CONSTRAINT "viaticos_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "employee_payments" ADD CONSTRAINT "employee_payments_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill a empresa primaria + membresía default para todos los usuarios activos
DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true AND "isActive" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_id IS NOT NULL THEN
    UPDATE "Expense" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "viaticos" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "employee_payments" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "journal_entries" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "invoices" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "purchase_orders" SET "companyId" = primary_id WHERE "companyId" IS NULL;

    INSERT INTO "user_companies" ("userId", "companyId", "isDefault")
    SELECT u.id, primary_id, true
    FROM "User" u
    WHERE u."isActive" = true
      AND NOT EXISTS (
        SELECT 1 FROM "user_companies" uc WHERE uc."userId" = u.id AND uc."companyId" = primary_id
      );
  END IF;
END $$;
