-- Phase 2 finance hardening: idempotency uniques + STAMPING status

-- InvoiceStatus: STAMPING (claim antes de llamar al PAC)
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'STAMPING';

-- Deduplicate before unique indexes (keep lowest id)
UPDATE "invoices" i
SET "cfdiUuid" = NULL
WHERE i."cfdiUuid" IS NOT NULL
  AND i.id NOT IN (
    SELECT MIN(id) FROM "invoices" WHERE "cfdiUuid" IS NOT NULL GROUP BY "cfdiUuid"
  );

UPDATE "journal_entries" j
SET "reference" = NULL
WHERE j."reference" IS NOT NULL
  AND j.id NOT IN (
    SELECT MIN(id) FROM "journal_entries" WHERE "reference" IS NOT NULL GROUP BY "reference"
  );

UPDATE "payments" p
SET "cfdiPaymentUuid" = NULL
WHERE p."cfdiPaymentUuid" IS NOT NULL
  AND p.id NOT IN (
    SELECT MIN(id) FROM "payments" WHERE "cfdiPaymentUuid" IS NOT NULL GROUP BY "cfdiPaymentUuid"
  );

UPDATE "payments" p
SET "speiTrackingKey" = NULL
WHERE p."speiTrackingKey" IS NOT NULL
  AND p.id NOT IN (
    SELECT MIN(id) FROM "payments" WHERE "speiTrackingKey" IS NOT NULL GROUP BY "speiTrackingKey"
  );

UPDATE "bank_transactions" b
SET "speiTrackingKey" = NULL
WHERE b."speiTrackingKey" IS NOT NULL
  AND b.id NOT IN (
    SELECT MIN(id) FROM "bank_transactions" WHERE "speiTrackingKey" IS NOT NULL GROUP BY "speiTrackingKey"
  );

DROP INDEX IF EXISTS "invoices_cfdiUuid_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_cfdiUuid_key" ON "invoices"("cfdiUuid");

CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_reference_key" ON "journal_entries"("reference");

CREATE UNIQUE INDEX IF NOT EXISTS "payments_cfdiPaymentUuid_key" ON "payments"("cfdiPaymentUuid");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_speiTrackingKey_key" ON "payments"("speiTrackingKey");

DROP INDEX IF EXISTS "bank_transactions_speiTrackingKey_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "bank_transactions_speiTrackingKey_key" ON "bank_transactions"("speiTrackingKey");
