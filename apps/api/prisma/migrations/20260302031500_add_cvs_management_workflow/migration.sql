-- AlterTable
ALTER TABLE "Role" ADD COLUMN "accesoGestionCvs" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "CvEmploymentStatus" AS ENUM ('NEW_CANDIDATE', 'CURRENT_EMPLOYEE', 'FORMER_EMPLOYEE');

-- CreateEnum
CREATE TYPE "CvStage" AS ENUM (
  'INBOX',
  'RECRUITER_SHORTLIST',
  'RECRUITER_REJECTED',
  'ADMIN_SHORTLIST',
  'ADMIN_REJECTED',
  'SUPERADMIN_SHORTLIST',
  'SUPERADMIN_REJECTED',
  'APPROVED'
);

-- CreateEnum
CREATE TYPE "CvDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "CvCandidate" (
    "id" SERIAL NOT NULL,
    "fullName" VARCHAR(180) NOT NULL,
    "email" VARCHAR(200),
    "whatsapp" VARCHAR(60),
    "category" VARCHAR(120) NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "employmentStatus" "CvEmploymentStatus" NOT NULL DEFAULT 'NEW_CANDIDATE',
    "stage" "CvStage" NOT NULL DEFAULT 'INBOX',
    "recruiterDecision" "CvDecision" NOT NULL DEFAULT 'PENDING',
    "adminDecision" "CvDecision" NOT NULL DEFAULT 'PENDING',
    "superadminDecision" "CvDecision" NOT NULL DEFAULT 'PENDING',
    "recruiterNotes" TEXT,
    "adminNotes" TEXT,
    "superadminNotes" TEXT,
    "cvFileUrl" VARCHAR(500) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" INTEGER NOT NULL,
    "recruiterReviewedById" INTEGER,
    "adminReviewedById" INTEGER,
    "superadminReviewedById" INTEGER,
    "recruiterReviewedAt" TIMESTAMP(3),
    "adminReviewedAt" TIMESTAMP(3),
    "superadminReviewedAt" TIMESTAMP(3),

    CONSTRAINT "CvCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CvCandidate_stage_category_sortOrder_idx" ON "CvCandidate"("stage", "category", "sortOrder");

-- CreateIndex
CREATE INDEX "CvCandidate_employmentStatus_idx" ON "CvCandidate"("employmentStatus");

-- CreateIndex
CREATE INDEX "CvCandidate_createdById_idx" ON "CvCandidate"("createdById");

-- AddForeignKey
ALTER TABLE "CvCandidate" ADD CONSTRAINT "CvCandidate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvCandidate" ADD CONSTRAINT "CvCandidate_recruiterReviewedById_fkey" FOREIGN KEY ("recruiterReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvCandidate" ADD CONSTRAINT "CvCandidate_adminReviewedById_fkey" FOREIGN KEY ("adminReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvCandidate" ADD CONSTRAINT "CvCandidate_superadminReviewedById_fkey" FOREIGN KEY ("superadminReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
