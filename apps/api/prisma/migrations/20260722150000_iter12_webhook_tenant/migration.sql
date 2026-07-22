-- Iter 12: tenant webhooks + SCIM uses CompanyApiKey (no new SCIM cols)

ALTER TABLE "outbound_webhooks" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_id IS NOT NULL THEN
    UPDATE "outbound_webhooks" SET "companyId" = primary_id WHERE "companyId" IS NULL;
  END IF;
END $$;

ALTER TABLE "outbound_webhooks" ALTER COLUMN "companyId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "outbound_webhooks_companyId_isActive_idx"
  ON "outbound_webhooks"("companyId", "isActive");

DO $$ BEGIN
  ALTER TABLE "outbound_webhooks" ADD CONSTRAINT "outbound_webhooks_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
