-- CreateEnum
CREATE TYPE "ClientTicketUrgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ClientTicketStatus" AS ENUM ('NEW', 'ASSIGNED', 'CLOSED');

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "latitud" DECIMAL(10,8),
ADD COLUMN     "longitud" DECIMAL(11,8);

-- CreateTable
CREATE TABLE "service_client_branches" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "branchNumber" VARCHAR(60),
    "name" VARCHAR(180) NOT NULL,
    "address" VARCHAR(220),
    "city" VARCHAR(120),
    "state" VARCHAR(120),
    "country" VARCHAR(80),
    "placeId" VARCHAR(180),
    "latitud" DECIMAL(10,8),
    "longitud" DECIMAL(11,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_client_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_ticket_requests" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "branchName" VARCHAR(180),
    "branchNumber" VARCHAR(60),
    "address" VARCHAR(220),
    "city" VARCHAR(120),
    "state" VARCHAR(120),
    "country" VARCHAR(80),
    "description" TEXT NOT NULL,
    "urgency" "ClientTicketUrgency" NOT NULL DEFAULT 'MEDIUM',
    "dueAt" TIMESTAMP(3),
    "status" "ClientTicketStatus" NOT NULL DEFAULT 'NEW',
    "placeId" VARCHAR(180),
    "latitud" DECIMAL(10,8),
    "longitud" DECIMAL(11,8),
    "activityId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_ticket_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_ticket_requests_activityId_key" ON "client_ticket_requests"("activityId");

-- CreateIndex
CREATE INDEX "client_ticket_requests_clientId_idx" ON "client_ticket_requests"("clientId");

-- CreateIndex
CREATE INDEX "client_ticket_requests_status_idx" ON "client_ticket_requests"("status");

-- AddForeignKey
ALTER TABLE "service_client_branches" ADD CONSTRAINT "service_client_branches_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "service_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_ticket_requests" ADD CONSTRAINT "client_ticket_requests_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "service_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_ticket_requests" ADD CONSTRAINT "client_ticket_requests_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "service_client_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_ticket_requests" ADD CONSTRAINT "client_ticket_requests_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
