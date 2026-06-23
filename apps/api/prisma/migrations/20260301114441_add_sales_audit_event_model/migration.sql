-- AlterTable
ALTER TABLE "notifications"
ADD COLUMN IF NOT EXISTS "category" VARCHAR(50),
ADD COLUMN IF NOT EXISTS "priority" VARCHAR(20) DEFAULT 'normal',
ADD COLUMN IF NOT EXISTS "triggerUserId" INTEGER;

UPDATE "notifications"
SET "category" = 'general'
WHERE "category" IS NULL;

ALTER TABLE "notifications"
ALTER COLUMN "category" SET NOT NULL;

-- CreateTable
CREATE TABLE IF NOT EXISTS "lunch_breaks" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "checkinTime" TIMESTAMP(3) NOT NULL,
    "checkoutTime" TIMESTAMP(3),
    "checkinPhotoUrl" TEXT NOT NULL,
    "checkoutPhotoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "isCheckinLate" BOOLEAN NOT NULL DEFAULT false,
    "isCheckoutLate" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lunch_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sales_audit_events" (
    "id" SERIAL NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "entityType" VARCHAR(80) NOT NULL,
    "entityId" INTEGER,
    "actorId" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "lunch_breaks_userId_date_key" ON "lunch_breaks"("userId", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sales_audit_events_createdAt_idx" ON "sales_audit_events"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sales_audit_events_entityType_entityId_idx" ON "sales_audit_events"("entityType", "entityId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notifications_userId_category_idx" ON "notifications"("userId", "category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notifications_isRead_createdAt_idx" ON "notifications"("isRead", "createdAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'lunch_breaks_userId_fkey'
    ) THEN
        ALTER TABLE "lunch_breaks"
        ADD CONSTRAINT "lunch_breaks_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END
$$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'sales_audit_events_actorId_fkey'
    ) THEN
        ALTER TABLE "sales_audit_events"
        ADD CONSTRAINT "sales_audit_events_actorId_fkey"
        FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'notifications_triggerUserId_fkey'
    ) THEN
        ALTER TABLE "notifications"
        ADD CONSTRAINT "notifications_triggerUserId_fkey"
        FOREIGN KEY ("triggerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$$;

