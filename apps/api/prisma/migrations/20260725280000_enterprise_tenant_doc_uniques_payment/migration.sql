-- Per-tenant document number uniques + Payment.companyId

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_id IS NOT NULL THEN
    UPDATE "payments" p
      SET "companyId" = COALESCE(
        (SELECT i."companyId" FROM "invoices" i WHERE i.id = p."invoiceId"),
        primary_id
      )
      WHERE p."companyId" IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "company_profile" LIMIT 1) THEN
    ALTER TABLE "payments" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_code_key') THEN
    ALTER TABLE "assets" DROP CONSTRAINT "assets_code_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_orders_orderNumber_key') THEN
    ALTER TABLE "maintenance_orders" DROP CONSTRAINT "maintenance_orders_orderNumber_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouses_code_key') THEN
    ALTER TABLE "warehouses" DROP CONSTRAINT "warehouses_code_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cotizaciones_quoteNumber_key') THEN
    ALTER TABLE "cotizaciones" DROP CONSTRAINT "cotizaciones_quoteNumber_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_entryNumber_key') THEN
    ALTER TABLE "journal_entries" DROP CONSTRAINT "journal_entries_entryNumber_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_reference_key') THEN
    ALTER TABLE "journal_entries" DROP CONSTRAINT "journal_entries_reference_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_invoiceNumber_key') THEN
    ALTER TABLE "invoices" DROP CONSTRAINT "invoices_invoiceNumber_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_poNumber_key') THEN
    ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_poNumber_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cycle_counts_countNumber_key') THEN
    ALTER TABLE "cycle_counts" DROP CONSTRAINT "cycle_counts_countNumber_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_rfqs_rfqNumber_key') THEN
    ALTER TABLE "purchase_rfqs" DROP CONSTRAINT "purchase_rfqs_rfqNumber_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_contracts_contractNumber_key') THEN
    ALTER TABLE "maintenance_contracts" DROP CONSTRAINT "maintenance_contracts_contractNumber_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_speiTrackingKey_key') THEN
    ALTER TABLE "payments" DROP CONSTRAINT "payments_speiTrackingKey_key";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_companyId_fkey') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "assets_companyId_code_key" ON "assets"("companyId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_orders_companyId_orderNumber_key" ON "maintenance_orders"("companyId", "orderNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "warehouses_companyId_code_key" ON "warehouses"("companyId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "cotizaciones_companyId_quoteNumber_key" ON "cotizaciones"("companyId", "quoteNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_companyId_entryNumber_key" ON "journal_entries"("companyId", "entryNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_companyId_reference_key" ON "journal_entries"("companyId", "reference");
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_companyId_invoiceNumber_key" ON "invoices"("companyId", "invoiceNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_orders_companyId_poNumber_key" ON "purchase_orders"("companyId", "poNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "cycle_counts_companyId_countNumber_key" ON "cycle_counts"("companyId", "countNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_rfqs_companyId_rfqNumber_key" ON "purchase_rfqs"("companyId", "rfqNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_contracts_companyId_contractNumber_key" ON "maintenance_contracts"("companyId", "contractNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_companyId_speiTrackingKey_key" ON "payments"("companyId", "speiTrackingKey");
CREATE INDEX IF NOT EXISTS "payments_companyId_idx" ON "payments"("companyId");
