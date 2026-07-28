-- Social posts + internal comunicados tenant stamp

ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "InternalComunicado" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_id IS NOT NULL THEN
    UPDATE "SocialPost" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "InternalComunicado" SET "companyId" = primary_id WHERE "companyId" IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "company_profile" LIMIT 1) THEN
    ALTER TABLE "SocialPost" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "InternalComunicado" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SocialPost_companyId_fkey') THEN
    ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InternalComunicado_companyId_fkey') THEN
    ALTER TABLE "InternalComunicado" ADD CONSTRAINT "InternalComunicado_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SocialPost_companyId_idx" ON "SocialPost"("companyId");
CREATE INDEX IF NOT EXISTS "InternalComunicado_companyId_idx" ON "InternalComunicado"("companyId");
