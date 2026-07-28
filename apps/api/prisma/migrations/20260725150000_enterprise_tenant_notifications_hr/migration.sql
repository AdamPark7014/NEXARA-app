-- Tenant stamp: notifications (nullable) + leave_requests (required)

ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;

  IF primary_id IS NOT NULL THEN
    -- Prefer membership company; fallback to primary
    UPDATE "notifications" n
    SET "companyId" = COALESCE(
      (SELECT uc."companyId" FROM "user_companies" uc
       WHERE uc."userId" = n."userId"
       ORDER BY uc."isDefault" DESC, uc."id" ASC LIMIT 1),
      primary_id
    )
    WHERE n."companyId" IS NULL;

    UPDATE "leave_requests" lr
    SET "companyId" = COALESCE(
      (SELECT uc."companyId" FROM "user_companies" uc
       WHERE uc."userId" = lr."userId"
       ORDER BY uc."isDefault" DESC, uc."id" ASC LIMIT 1),
      primary_id
    )
    WHERE lr."companyId" IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "company_profile" LIMIT 1) THEN
    ALTER TABLE "leave_requests" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_companyId_fkey') THEN
    ALTER TABLE "notifications"
      ADD CONSTRAINT "notifications_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_requests_companyId_fkey') THEN
    ALTER TABLE "leave_requests"
      ADD CONSTRAINT "leave_requests_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "notifications_companyId_idx" ON "notifications"("companyId");
CREATE INDEX IF NOT EXISTS "leave_requests_companyId_idx" ON "leave_requests"("companyId");
