-- CreateTable
CREATE TABLE "UserPushEndpoint" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "fcmToken" VARCHAR(512),
    "webPushEndpoint" VARCHAR(2048),
    "webPushKeys" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPushEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserPushEndpoint_fcmToken_key" ON "UserPushEndpoint"("fcmToken");

-- CreateIndex
CREATE UNIQUE INDEX "UserPushEndpoint_webPushEndpoint_key" ON "UserPushEndpoint"("webPushEndpoint");

-- CreateIndex
CREATE INDEX "UserPushEndpoint_userId_idx" ON "UserPushEndpoint"("userId");

-- AddForeignKey
ALTER TABLE "UserPushEndpoint" ADD CONSTRAINT "UserPushEndpoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
