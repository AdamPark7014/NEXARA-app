-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('ATTENDANCE_CHECKIN', 'ATTENDANCE_CHECKOUT', 'ATTENDANCE_ABSENCE', 'LUNCH_CHECKIN', 'LUNCH_CHECKOUT', 'ACTIVITY_ASSIGNED', 'ACTIVITY_APPROVED', 'ACTIVITY_REJECTED', 'ACTIVITY_RESUBMIT_REQUESTED', 'EVIDENCE_SUBMITTED', 'EVIDENCE_APPROVED', 'EVIDENCE_REJECTED', 'EVIDENCE_RESUBMIT_REQUESTED', 'VIATICO_ASSIGNED', 'VIATICO_APPROVED', 'VIATICO_REJECTED', 'VIATICO_PAID', 'TOOL_REQUESTED', 'TOOL_APPROVED', 'TOOL_REJECTED', 'TOOL_DELIVERED', 'TOOL_RETURNED', 'TOOL_RENEWAL_REQUESTED', 'TOOL_RENEWAL_APPROVED', 'TOOL_RENEWAL_REJECTED', 'TOOL_EXPIRATION_WARNING', 'TOOL_EXPIRATION_DUE', 'FINE_CREATED', 'FINE_PAID', 'FINE_CANCELLED', 'PROFILE_DOCUMENT_UPLOADED', 'PROFILE_DOCUMENT_APPROVED', 'PROFILE_DOCUMENT_REJECTED', 'VEHICLE_DELIVERY_REQUESTED', 'VEHICLE_DELIVERY_APPROVED', 'VEHICLE_DELIVERY_REJECTED', 'VEHICLE_RENEWAL_REQUESTED', 'VEHICLE_RENEWAL_APPROVED', 'VEHICLE_RENEWAL_REJECTED', 'QUOTE_EXPIRING', 'QUOTE_EXPIRED', 'QUOTE_SIGNED', 'ORDER_CREATED', 'PROJECT_COMPLETED');
ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TABLE "tool_request_notifications" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "NotificationType_old";
COMMIT;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "category" VARCHAR(50) NOT NULL,
ADD COLUMN     "priority" VARCHAR(20) DEFAULT 'normal',
ADD COLUMN     "triggerUserId" INTEGER;

-- CreateTable
CREATE TABLE "lunch_breaks" (
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
CREATE TABLE "sales_audit_events" (
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
CREATE UNIQUE INDEX "lunch_breaks_userId_date_key" ON "lunch_breaks"("userId", "date");

-- CreateIndex
CREATE INDEX "sales_audit_events_createdAt_idx" ON "sales_audit_events"("createdAt");

-- CreateIndex
CREATE INDEX "sales_audit_events_entityType_entityId_idx" ON "sales_audit_events"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "notifications_userId_category_idx" ON "notifications"("userId", "category");

-- CreateIndex
CREATE INDEX "notifications_isRead_createdAt_idx" ON "notifications"("isRead", "createdAt");

-- AddForeignKey
ALTER TABLE "lunch_breaks" ADD CONSTRAINT "lunch_breaks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_audit_events" ADD CONSTRAINT "sales_audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_triggerUserId_fkey" FOREIGN KEY ("triggerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

