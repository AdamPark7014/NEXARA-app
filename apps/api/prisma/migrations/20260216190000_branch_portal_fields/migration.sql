-- AlterEnum
ALTER TYPE "ClientTicketStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "ClientTicketStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- AlterTable
ALTER TABLE "service_client_branches"
ADD COLUMN "portalEmail" VARCHAR(200),
ADD COLUMN "portalPasswordHash" TEXT,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "client_ticket_requests"
ADD COLUMN "evidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE UNIQUE INDEX "service_client_branches_portalEmail_key" ON "service_client_branches"("portalEmail");
CREATE UNIQUE INDEX "service_client_branches_clientId_branchNumber_key" ON "service_client_branches"("clientId", "branchNumber");
