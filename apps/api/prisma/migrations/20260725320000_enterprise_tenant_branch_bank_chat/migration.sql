-- Stamp companyId on ServiceClientBranch, BankTransaction, BankReconciliation, ChatMessage

ALTER TABLE "service_client_branches" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "bank_reconciliations" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;

  IF primary_id IS NOT NULL THEN
    UPDATE "service_client_branches" b
      SET "companyId" = COALESCE(
        (SELECT c."companyId" FROM "service_clients" c WHERE c.id = b."clientId"),
        primary_id
      )
      WHERE b."companyId" IS NULL;

    UPDATE "bank_transactions" t
      SET "companyId" = COALESCE(
        (SELECT a."companyId" FROM "bank_accounts" a WHERE a.id = t."bankAccountId"),
        primary_id
      )
      WHERE t."companyId" IS NULL;

    UPDATE "bank_reconciliations" r
      SET "companyId" = COALESCE(
        (SELECT a."companyId" FROM "bank_accounts" a WHERE a.id = r."bankAccountId"),
        (SELECT t."companyId" FROM "bank_transactions" t WHERE t.id = r."bankTransactionId"),
        primary_id
      )
      WHERE r."companyId" IS NULL;

    UPDATE "chat_messages" m
      SET "companyId" = COALESCE(
        (SELECT c."companyId" FROM "chat_channels" c WHERE c.id = m."channelId"),
        primary_id
      )
      WHERE m."companyId" IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "company_profile" LIMIT 1) THEN
    ALTER TABLE "service_client_branches" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "bank_transactions" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "bank_reconciliations" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "chat_messages" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_client_branches_companyId_fkey') THEN
    ALTER TABLE "service_client_branches" ADD CONSTRAINT "service_client_branches_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_companyId_fkey') THEN
    ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_reconciliations_companyId_fkey') THEN
    ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_companyId_fkey') THEN
    ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "service_client_branches_companyId_idx" ON "service_client_branches"("companyId");
CREATE INDEX IF NOT EXISTS "bank_transactions_companyId_idx" ON "bank_transactions"("companyId");
CREATE INDEX IF NOT EXISTS "bank_reconciliations_companyId_idx" ON "bank_reconciliations"("companyId");
CREATE INDEX IF NOT EXISTS "chat_messages_companyId_idx" ON "chat_messages"("companyId");
