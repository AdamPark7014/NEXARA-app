-- Attendance + Studio CMS tenant stamps

ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "AttendanceDay" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "lunch_breaks" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "news_posts" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "page_content" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_id IS NOT NULL THEN
    UPDATE "Attendance" a
      SET "companyId" = COALESCE(
        (SELECT uc."companyId" FROM "user_companies" uc WHERE uc."userId" = a."userId" ORDER BY uc."isDefault" DESC, uc.id ASC LIMIT 1),
        primary_id
      )
      WHERE a."companyId" IS NULL;

    UPDATE "AttendanceDay" d
      SET "companyId" = COALESCE(
        (SELECT uc."companyId" FROM "user_companies" uc WHERE uc."userId" = d."userId" ORDER BY uc."isDefault" DESC, uc.id ASC LIMIT 1),
        primary_id
      )
      WHERE d."companyId" IS NULL;

    UPDATE "lunch_breaks" lb
      SET "companyId" = COALESCE(
        (SELECT uc."companyId" FROM "user_companies" uc WHERE uc."userId" = lb."userId" ORDER BY uc."isDefault" DESC, uc.id ASC LIMIT 1),
        primary_id
      )
      WHERE lb."companyId" IS NULL;

    UPDATE "news_posts" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "page_content" SET "companyId" = primary_id WHERE "companyId" IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "company_profile" LIMIT 1) THEN
    ALTER TABLE "Attendance" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "AttendanceDay" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "lunch_breaks" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "news_posts" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "page_content" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

-- Drop global unique on news slug / page section if present, replace with composite
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'news_posts_slug_key'
  ) THEN
    ALTER TABLE "news_posts" DROP CONSTRAINT "news_posts_slug_key";
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'page_content_section_key'
  ) THEN
    ALTER TABLE "page_content" DROP CONSTRAINT "page_content_section_key";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Attendance_companyId_fkey') THEN
    ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AttendanceDay_companyId_fkey') THEN
    ALTER TABLE "AttendanceDay" ADD CONSTRAINT "AttendanceDay_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lunch_breaks_companyId_fkey') THEN
    ALTER TABLE "lunch_breaks" ADD CONSTRAINT "lunch_breaks_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'news_posts_companyId_fkey') THEN
    ALTER TABLE "news_posts" ADD CONSTRAINT "news_posts_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'page_content_companyId_fkey') THEN
    ALTER TABLE "page_content" ADD CONSTRAINT "page_content_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "news_posts_companyId_slug_key" ON "news_posts"("companyId", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "page_content_companyId_section_key" ON "page_content"("companyId", "section");
CREATE INDEX IF NOT EXISTS "Attendance_companyId_idx" ON "Attendance"("companyId");
CREATE INDEX IF NOT EXISTS "Attendance_userId_timestamp_idx" ON "Attendance"("userId", "timestamp");
CREATE INDEX IF NOT EXISTS "AttendanceDay_companyId_idx" ON "AttendanceDay"("companyId");
CREATE INDEX IF NOT EXISTS "lunch_breaks_companyId_idx" ON "lunch_breaks"("companyId");
CREATE INDEX IF NOT EXISTS "news_posts_companyId_status_idx" ON "news_posts"("companyId", "status");
CREATE INDEX IF NOT EXISTS "page_content_companyId_idx" ON "page_content"("companyId");
