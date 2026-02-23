-- AlterTable
ALTER TABLE "activity_evidences" ADD COLUMN     "correctionSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedStep" VARCHAR(50),
ADD COLUMN     "reviewNotes" TEXT,
ADD COLUMN     "reviewStatus" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" INTEGER;

-- AddForeignKey
ALTER TABLE "activity_evidences" ADD CONSTRAINT "activity_evidences_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
