-- Evidence per assignee + Core kind / photo count on Activity

ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "coreKind" VARCHAR(20);
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "evidencePhotoRequired" INTEGER NOT NULL DEFAULT 4;

ALTER TABLE "activity_assignees" ADD COLUMN IF NOT EXISTS "indicaciones" TEXT;

-- Per-user evidence: add userId, backfill from activity responsable
ALTER TABLE "activity_evidences" ADD COLUMN IF NOT EXISTS "userId" INTEGER;

UPDATE "activity_evidences" ae
SET "userId" = a."responsableId"
FROM "Activity" a
WHERE a.id = ae."activityId"
  AND ae."userId" IS NULL;

-- Drop orphan evidence rows that cannot resolve a user
DELETE FROM "activity_evidences" WHERE "userId" IS NULL;

ALTER TABLE "activity_evidences" ALTER COLUMN "userId" SET NOT NULL;

-- Drop old 1:1 unique on activityId (name varies; try common Prisma names)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'activity_evidences'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) LIKE '%activityId%'
      AND pg_get_constraintdef(c.oid) NOT LIKE '%userId%'
  LOOP
    EXECUTE format('ALTER TABLE activity_evidences DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "activity_evidences_activityId_userId_key"
  ON "activity_evidences"("activityId", "userId");

CREATE INDEX IF NOT EXISTS "activity_evidences_userId_idx"
  ON "activity_evidences"("userId");

CREATE INDEX IF NOT EXISTS "activity_evidences_activityId_idx"
  ON "activity_evidences"("activityId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activity_evidences_userId_fkey'
  ) THEN
    ALTER TABLE "activity_evidences"
      ADD CONSTRAINT "activity_evidences_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
