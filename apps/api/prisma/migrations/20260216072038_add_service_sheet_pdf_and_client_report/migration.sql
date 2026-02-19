-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('PREVENTIVO', 'CORRECTIVO', 'EMERGENCIA', 'INSTALACION', 'OTRO');

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "branchAddress" VARCHAR(220),
ADD COLUMN     "branchCity" VARCHAR(120),
ADD COLUMN     "branchName" VARCHAR(160),
ADD COLUMN     "branchNumber" VARCHAR(60),
ADD COLUMN     "branchState" VARCHAR(120),
ADD COLUMN     "clientId" INTEGER,
ADD COLUMN     "slaAlertedAt" TIMESTAMP(3),
ADD COLUMN     "ticketType" "TicketType" DEFAULT 'PREVENTIVO';

-- CreateTable
CREATE TABLE "service_clients" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "logoUrl" VARCHAR(500),
    "contactName" VARCHAR(160),
    "contactEmail" VARCHAR(200),
    "contactPhone" VARCHAR(60),
    "address" VARCHAR(220),
    "city" VARCHAR(120),
    "state" VARCHAR(120),
    "country" VARCHAR(80),
    "accountCode" VARCHAR(80),
    "portalEmail" VARCHAR(200),
    "portalPasswordHash" TEXT,
    "reportUrl" VARCHAR(500),
    "reportGeneratedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_sheets" (
    "id" SERIAL NOT NULL,
    "activityId" INTEGER NOT NULL,
    "managerName" VARCHAR(160),
    "managerRole" VARCHAR(160),
    "workSummary" TEXT,
    "equipmentList" JSONB,
    "observations" TEXT,
    "signedName" VARCHAR(160),
    "pdfUrl" VARCHAR(500),
    "survey" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_clients_portalEmail_key" ON "service_clients"("portalEmail");

-- CreateIndex
CREATE UNIQUE INDEX "service_sheets_activityId_key" ON "service_sheets"("activityId");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "service_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_sheets" ADD CONSTRAINT "service_sheets_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
