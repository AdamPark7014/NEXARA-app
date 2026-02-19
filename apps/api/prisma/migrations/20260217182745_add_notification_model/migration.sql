-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('QUOTE_EXPIRING', 'QUOTE_EXPIRED', 'QUOTE_SIGNED', 'ORDER_CREATED', 'PROJECT_COMPLETED', 'VIATICO_APPROVED', 'VIATICO_REJECTED');

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "relatedEntityId" INTEGER,
    "entityType" VARCHAR(50),
    "relatedUrl" VARCHAR(500),
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
