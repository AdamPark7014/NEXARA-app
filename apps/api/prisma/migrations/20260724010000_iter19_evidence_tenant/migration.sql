-- Iter 19: Evidence tenant (denormalized companyId from Activity)

DO $$
DECLARE
  primary_cid INTEGER;
BEGIN
  SELECT id INTO primary_cid FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_cid IS NULL THEN
    SELECT id INTO primary_cid FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_cid IS NULL THEN
    RAISE EXCEPTION 'No company_profile for Evidence backfill';
  END IF;

  ALTER TABLE "Evidence" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

  UPDATE "Evidence" e
  SET "companyId" = a."companyId"
  FROM "Activity" a
  WHERE e."actividadId" = a.id AND e."companyId" IS NULL;

  UPDATE "Evidence" SET "companyId" = primary_cid WHERE "companyId" IS NULL;

  ALTER TABLE "Evidence" ALTER COLUMN "companyId" SET NOT NULL;

  CREATE INDEX IF NOT EXISTS "Evidence_companyId_idx" ON "Evidence"("companyId");
  CREATE INDEX IF NOT EXISTS "Evidence_actividadId_idx" ON "Evidence"("actividadId");

  BEGIN
    ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
