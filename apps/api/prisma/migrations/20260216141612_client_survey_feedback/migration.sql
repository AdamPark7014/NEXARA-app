-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "clientSurveyCompletedAt" TIMESTAMP(3),
ADD COLUMN     "clientSurveyRequestedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "client_activity_feedback" (
    "id" SERIAL NOT NULL,
    "activityId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "rating" INTEGER,
    "wasOnTime" BOOLEAN,
    "wasFriendly" BOOLEAN,
    "wasSolved" BOOLEAN,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_activity_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_activity_feedback_activityId_key" ON "client_activity_feedback"("activityId");

-- CreateIndex
CREATE INDEX "client_activity_feedback_clientId_idx" ON "client_activity_feedback"("clientId");

-- AddForeignKey
ALTER TABLE "client_activity_feedback" ADD CONSTRAINT "client_activity_feedback_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_activity_feedback" ADD CONSTRAINT "client_activity_feedback_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "service_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
