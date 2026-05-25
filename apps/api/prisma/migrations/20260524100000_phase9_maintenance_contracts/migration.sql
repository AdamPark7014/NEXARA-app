-- Fase 9 — Contratos de mantenimiento recurrente con OT automáticas

CREATE TYPE "MaintenanceContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "MaintenanceFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');
CREATE TYPE "MaintenanceContractVisitStatus" AS ENUM ('SCHEDULED', 'GENERATED', 'COMPLETED', 'SKIPPED');

CREATE TABLE "maintenance_contracts" (
    "id" SERIAL NOT NULL,
    "contractNumber" VARCHAR(40) NOT NULL,
    "clientId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "ownerId" INTEGER,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "serviceScope" TEXT,
    "frequency" "MaintenanceFrequency" NOT NULL,
    "slaResponseHours" INTEGER NOT NULL DEFAULT 48,
    "slaResolutionHours" INTEGER NOT NULL DEFAULT 72,
    "monthlyFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'MXN',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "nextVisitDate" DATE,
    "status" "MaintenanceContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "autoGenerateOt" BOOLEAN NOT NULL DEFAULT true,
    "notifyHoursBefore" INTEGER NOT NULL DEFAULT 24,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "maintenance_contracts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "maintenance_contracts_contractNumber_key" ON "maintenance_contracts"("contractNumber");
CREATE INDEX "maintenance_contracts_status_nextVisitDate_idx" ON "maintenance_contracts"("status", "nextVisitDate");
CREATE INDEX "maintenance_contracts_clientId_status_idx" ON "maintenance_contracts"("clientId", "status");

CREATE TABLE "maintenance_contract_visits" (
    "id" SERIAL NOT NULL,
    "contractId" INTEGER NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "status" "MaintenanceContractVisitStatus" NOT NULL DEFAULT 'SCHEDULED',
    "generatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "operationalProjectId" INTEGER,
    "activityId" INTEGER,
    "assignedToId" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_contract_visits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "maintenance_contract_visits_contractId_scheduledDate_key" ON "maintenance_contract_visits"("contractId", "scheduledDate");
CREATE INDEX "maintenance_contract_visits_status_scheduledDate_idx" ON "maintenance_contract_visits"("status", "scheduledDate");

ALTER TABLE "maintenance_contracts"
  ADD CONSTRAINT "maintenance_contracts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "service_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "maintenance_contracts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "service_client_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "maintenance_contracts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "maintenance_contract_visits"
  ADD CONSTRAINT "maintenance_contract_visits_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "maintenance_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "maintenance_contract_visits_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
