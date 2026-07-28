-- Contact messages + newsletter subscribers tenant stamp

ALTER TABLE "contact_messages" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "newsletter_subscribers" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_id IS NOT NULL THEN
    UPDATE "contact_messages" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "newsletter_subscribers" SET "companyId" = primary_id WHERE "companyId" IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "company_profile" LIMIT 1) THEN
    ALTER TABLE "contact_messages" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "newsletter_subscribers" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'newsletter_subscribers_email_key') THEN
    ALTER TABLE "newsletter_subscribers" DROP CONSTRAINT "newsletter_subscribers_email_key";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_messages_companyId_fkey') THEN
    ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'newsletter_subscribers_companyId_fkey') THEN
    ALTER TABLE "newsletter_subscribers" ADD CONSTRAINT "newsletter_subscribers_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "newsletter_subscribers_companyId_email_key"
  ON "newsletter_subscribers"("companyId", "email");
CREATE INDEX IF NOT EXISTS "contact_messages_companyId_idx" ON "contact_messages"("companyId");
CREATE INDEX IF NOT EXISTS "newsletter_subscribers_companyId_idx" ON "newsletter_subscribers"("companyId");
