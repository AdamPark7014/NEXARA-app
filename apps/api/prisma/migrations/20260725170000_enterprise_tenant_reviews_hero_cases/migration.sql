-- Performance reviews, Hero CMS, Case studies, Feature flags (tenant)

ALTER TABLE "performance_reviews" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "hero_slides" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "hero_video" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "CaseStudy" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "feature_flags" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_id IS NOT NULL THEN
    UPDATE "performance_reviews" pr
      SET "companyId" = COALESCE(
        (SELECT uc."companyId" FROM "user_companies" uc WHERE uc."userId" = pr."userId" ORDER BY uc."isDefault" DESC, uc.id ASC LIMIT 1),
        primary_id
      )
      WHERE pr."companyId" IS NULL;

    UPDATE "hero_slides" SET "companyId" = primary_id WHERE "companyId" IS NULL;
    UPDATE "hero_video" SET "companyId" = primary_id WHERE "companyId" IS NULL;

    -- CaseStudy table name: Prisma default without @@map is "CaseStudy"
    UPDATE "CaseStudy" cs
      SET "companyId" = primary_id
      WHERE cs."companyId" IS NULL;

    -- Existing flags stay platform-global (companyId NULL)
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "company_profile" LIMIT 1) THEN
    ALTER TABLE "performance_reviews" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "hero_slides" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "hero_video" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "CaseStudy" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CaseStudy_slug_key') THEN
    ALTER TABLE "CaseStudy" DROP CONSTRAINT "CaseStudy_slug_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feature_flags_key_key') THEN
    ALTER TABLE "feature_flags" DROP CONSTRAINT "feature_flags_key_key";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'performance_reviews_companyId_fkey') THEN
    ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hero_slides_companyId_fkey') THEN
    ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hero_video_companyId_fkey') THEN
    ALTER TABLE "hero_video" ADD CONSTRAINT "hero_video_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CaseStudy_companyId_fkey') THEN
    ALTER TABLE "CaseStudy" ADD CONSTRAINT "CaseStudy_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feature_flags_companyId_fkey') THEN
    ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "CaseStudy_companyId_slug_key" ON "CaseStudy"("companyId", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "feature_flags_key_companyId_key" ON "feature_flags"("key", "companyId");
CREATE INDEX IF NOT EXISTS "performance_reviews_companyId_idx" ON "performance_reviews"("companyId");
CREATE INDEX IF NOT EXISTS "hero_slides_companyId_idx" ON "hero_slides"("companyId");
CREATE INDEX IF NOT EXISTS "hero_video_companyId_idx" ON "hero_video"("companyId");
CREATE INDEX IF NOT EXISTS "CaseStudy_companyId_idx" ON "CaseStudy"("companyId");
CREATE INDEX IF NOT EXISTS "feature_flags_companyId_idx" ON "feature_flags"("companyId");
