-- ACS → Operaciones: sellos de entrada/salida en Activity / ActivityAssignee
-- y notificación de notificación denegado.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACS_ACCESS_DENIED';

ALTER TABLE "Activity"
  ADD COLUMN IF NOT EXISTS "acsEnteredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "acsEnteredByUserId" INTEGER,
  ADD COLUMN IF NOT EXISTS "acsEntryDoor" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "acsExitedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "acsLeftSite" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Activity_acsEnteredAt_idx" ON "Activity"("acsEnteredAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Activity_acsEnteredByUserId_fkey'
  ) THEN
    ALTER TABLE "Activity"
      ADD CONSTRAINT "Activity_acsEnteredByUserId_fkey"
      FOREIGN KEY ("acsEnteredByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "activity_assignees"
  ADD COLUMN IF NOT EXISTS "acsEnteredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "acsExitedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "acsLeftSite" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "acsEntryDoor" VARCHAR(120);
