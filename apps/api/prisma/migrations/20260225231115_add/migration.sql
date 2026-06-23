-- CreateEnum
CREATE TYPE "ToolRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'IN_USE', 'RETURNED', 'DAMAGED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RenewalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TOOL_EXPIRATION_WARNING';
ALTER TYPE "NotificationType" ADD VALUE 'TOOL_EXPIRATION_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'TOOL_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'TOOL_DELIVERED';
ALTER TYPE "NotificationType" ADD VALUE 'TOOL_RENEWAL_APPROVED';

-- CreateTable
CREATE TABLE "tool_requests" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "toolName" VARCHAR(200) NOT NULL,
    "model" VARCHAR(200) NOT NULL,
    "serialNumber" VARCHAR(200) NOT NULL,
    "reason" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "expectedReturnDate" TIMESTAMP(3) NOT NULL,
    "generalPhotoUrl" VARCHAR(500) NOT NULL,
    "specificationsPhotoUrl" VARCHAR(500) NOT NULL,
    "status" "ToolRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvalDate" TIMESTAMP(3),
    "deliveryDate" TIMESTAMP(3),
    "returnDate" TIMESTAMP(3),
    "damageDescription" TEXT,
    "damagePhotoUrl" VARCHAR(500),
    "adminNotes" TEXT,
    "approvedBy" INTEGER,
    "notificationSent" BOOLEAN NOT NULL DEFAULT false,
    "notificationSentAt" TIMESTAMP(3),
    "renewalCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tool_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_renewals" (
    "id" SERIAL NOT NULL,
    "toolRequestId" INTEGER NOT NULL,
    "previousReturnDate" TIMESTAMP(3) NOT NULL,
    "newReturnDate" TIMESTAMP(3) NOT NULL,
    "renewalReason" TEXT,
    "approvedBy" INTEGER,
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvalDate" TIMESTAMP(3),
    "status" "RenewalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_renewals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_request_notifications" (
    "id" SERIAL NOT NULL,
    "toolRequestId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "type" "NotificationType" NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_request_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tool_requests_usuarioId_status_idx" ON "tool_requests"("usuarioId", "status");

-- CreateIndex
CREATE INDEX "tool_requests_status_requestDate_idx" ON "tool_requests"("status", "requestDate");

-- CreateIndex
CREATE INDEX "tool_requests_expectedReturnDate_idx" ON "tool_requests"("expectedReturnDate");

-- CreateIndex
CREATE INDEX "tool_renewals_toolRequestId_status_idx" ON "tool_renewals"("toolRequestId", "status");

-- CreateIndex
CREATE INDEX "tool_renewals_approvalDate_idx" ON "tool_renewals"("approvalDate");

-- CreateIndex
CREATE INDEX "tool_request_notifications_usuarioId_isRead_idx" ON "tool_request_notifications"("usuarioId", "isRead");

-- CreateIndex
CREATE INDEX "tool_request_notifications_toolRequestId_type_idx" ON "tool_request_notifications"("toolRequestId", "type");

-- AddForeignKey
ALTER TABLE "tool_requests" ADD CONSTRAINT "tool_requests_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_requests" ADD CONSTRAINT "tool_requests_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_renewals" ADD CONSTRAINT "tool_renewals_toolRequestId_fkey" FOREIGN KEY ("toolRequestId") REFERENCES "tool_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_renewals" ADD CONSTRAINT "tool_renewals_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_request_notifications" ADD CONSTRAINT "tool_request_notifications_toolRequestId_fkey" FOREIGN KEY ("toolRequestId") REFERENCES "tool_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_request_notifications" ADD CONSTRAINT "tool_request_notifications_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
