-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "ticketTypeCustom" VARCHAR(120);

-- AlterTable
ALTER TABLE "operational_projects" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Activity_clientId_idx" ON "Activity"("clientId");
