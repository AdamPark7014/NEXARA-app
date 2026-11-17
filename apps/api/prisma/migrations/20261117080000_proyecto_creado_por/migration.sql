-- AlterTable
ALTER TABLE "operational_projects" ADD COLUMN IF NOT EXISTS "createdById" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "operational_projects_createdById_idx" ON "operational_projects"("createdById");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "operational_projects" ADD CONSTRAINT "operational_projects_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
