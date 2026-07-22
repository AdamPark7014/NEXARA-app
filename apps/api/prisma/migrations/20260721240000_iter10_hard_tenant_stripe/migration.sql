-- Iter 10: hard tenant NOT NULL + Stripe subscription id

ALTER TABLE "company_profile" ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" VARCHAR(80);
ALTER TABLE "company_profile" ADD COLUMN IF NOT EXISTS "stripePriceId" VARCHAR(80);

-- Backfill any remaining nulls to primary company
DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_id IS NOT NULL THEN
    UPDATE "invoices" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "journal_entries" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "Expense" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "viaticos" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "employee_payments" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "purchase_orders" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "sales_opportunities" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "warehouses" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "client_ticket_requests" SET "companyId" = primary_id WHERE "companyId" IS NULL;
  END IF;
END $$;

-- Harden FKs (nullable → NOT NULL) for scoped product tables
ALTER TABLE "invoices" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "journal_entries" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Expense" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "viaticos" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "employee_payments" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "purchase_orders" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "sales_opportunities" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "warehouses" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "client_ticket_requests" ALTER COLUMN "companyId" SET NOT NULL;
