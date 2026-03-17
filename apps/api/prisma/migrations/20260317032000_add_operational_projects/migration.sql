-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "OperationalProjectStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "ActivityType" AS ENUM ('INTERNAL', 'CLIENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "Activity"
  ADD COLUMN IF NOT EXISTS "activityType" "ActivityType" DEFAULT 'CLIENT',
  ADD COLUMN IF NOT EXISTS "projectId" INTEGER;

-- CreateTable
CREATE TABLE IF NOT EXISTS "operational_projects" (
  "id" SERIAL NOT NULL,
  "title" VARCHAR(220) NOT NULL,
  "description" TEXT,
  "status" "OperationalProjectStatus" NOT NULL DEFAULT 'ACTIVE',
  "vendorId" INTEGER NOT NULL,
  "clientId" INTEGER NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "actualEndDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "operational_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "project_engineers" (
  "id" SERIAL NOT NULL,
  "projectId" INTEGER NOT NULL,
  "engineerId" INTEGER NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "project_engineers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Activity_projectId_idx" ON "Activity"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "operational_projects_vendorId_idx" ON "operational_projects"("vendorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "operational_projects_clientId_idx" ON "operational_projects"("clientId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "operational_projects_status_idx" ON "operational_projects"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "project_engineers_projectId_idx" ON "project_engineers"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "project_engineers_engineerId_idx" ON "project_engineers"("engineerId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "project_engineers_projectId_engineerId_key" ON "project_engineers"("projectId", "engineerId");

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "operational_projects"
    ADD CONSTRAINT "operational_projects_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "operational_projects"
    ADD CONSTRAINT "operational_projects_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "service_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "project_engineers"
    ADD CONSTRAINT "project_engineers_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "operational_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "project_engineers"
    ADD CONSTRAINT "project_engineers_engineerId_fkey"
    FOREIGN KEY ("engineerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "Activity"
    ADD CONSTRAINT "Activity_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "operational_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;