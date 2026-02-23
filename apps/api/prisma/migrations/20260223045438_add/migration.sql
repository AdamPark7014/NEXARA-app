-- CreateTable
CREATE TABLE "activity_evidences" (
    "id" SERIAL NOT NULL,
    "activityId" INTEGER NOT NULL,
    "entryPhotoUrl" VARCHAR(500),
    "entryLatitude" DECIMAL(10,8),
    "entryLongitude" DECIMAL(11,8),
    "entryPhotoUploadedAt" TIMESTAMP(3),
    "evidencePhotos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidencePhotosUploadedAt" TIMESTAMP(3),
    "serviceSheetPdfUrl" VARCHAR(500),
    "serviceSheetUploadedAt" TIMESTAMP(3),
    "serviceSheetData" JSONB,
    "serviceSheetCompletedAt" TIMESTAMP(3),
    "exitPhotoUrl" VARCHAR(500),
    "exitLatitude" DECIMAL(10,8),
    "exitLongitude" DECIMAL(11,8),
    "exitPhotoUploadedAt" TIMESTAMP(3),
    "status" VARCHAR(50) NOT NULL DEFAULT 'ENTRY_PHOTO',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "activity_evidences_activityId_key" ON "activity_evidences"("activityId");

-- AddForeignKey
ALTER TABLE "activity_evidences" ADD CONSTRAINT "activity_evidences_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
