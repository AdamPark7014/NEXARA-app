-- ActivityEvidence.companyId for tenant middleware + IDOR hardening

ALTER TABLE "activity_evidences" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_id IS NOT NULL THEN
    UPDATE "activity_evidences" e
      SET "companyId" = COALESCE(
        (SELECT a."companyId" FROM "Activity" a WHERE a.id = e."activityId"),
        primary_id
      )
      WHERE e."companyId" IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "company_profile" LIMIT 1) THEN
    ALTER TABLE "activity_evidences" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_evidences_companyId_fkey') THEN
    ALTER TABLE "activity_evidences" ADD CONSTRAINT "activity_evidences_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "activity_evidences_companyId_idx" ON "activity_evidences"("companyId");
