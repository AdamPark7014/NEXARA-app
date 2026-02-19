-- CreateEnum
CREATE TYPE "SalesLeadStatus" AS ENUM ('NEW', 'QUALIFIED', 'NURTURING', 'LOST', 'CONVERTED');

-- CreateEnum
CREATE TYPE "SalesOpportunityStage" AS ENUM ('DISCOVERY', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "SalesProjectStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'CLOSED', 'ON_HOLD');

-- CreateTable
CREATE TABLE "sales_clients" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "legalName" VARCHAR(220),
    "taxId" VARCHAR(40),
    "fiscalAddress" TEXT,
    "billingEmail" VARCHAR(200),
    "billingPhone" VARCHAR(60),
    "industry" VARCHAR(160),
    "website" VARCHAR(200),
    "status" VARCHAR(80),
    "notes" TEXT,
    "ownerId" INTEGER,
    "serviceClientId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_client_documents" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "type" VARCHAR(120) NOT NULL,
    "fileUrl" VARCHAR(500) NOT NULL,
    "fileName" VARCHAR(220),
    "version" INTEGER NOT NULL DEFAULT 1,
    "uploadedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_client_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_leads" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(180),
    "company" VARCHAR(200),
    "email" VARCHAR(200),
    "phone" VARCHAR(60),
    "source" VARCHAR(160),
    "status" "SalesLeadStatus" NOT NULL DEFAULT 'NEW',
    "score" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "clientId" INTEGER,
    "createdById" INTEGER,
    "ownerId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_opportunities" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(220) NOT NULL,
    "description" TEXT,
    "stage" "SalesOpportunityStage" NOT NULL DEFAULT 'DISCOVERY',
    "value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "expectedCloseDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "clientId" INTEGER,
    "leadId" INTEGER,
    "ownerId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_opportunity_notes" (
    "id" SERIAL NOT NULL,
    "opportunityId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_opportunity_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_opportunity_evidences" (
    "id" SERIAL NOT NULL,
    "opportunityId" INTEGER NOT NULL,
    "fileUrl" VARCHAR(500) NOT NULL,
    "fileName" VARCHAR(220),
    "kind" VARCHAR(40),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_opportunity_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_opportunity_quotes" (
    "id" SERIAL NOT NULL,
    "opportunityId" INTEGER NOT NULL,
    "cotizacionId" INTEGER,
    "versionLabel" VARCHAR(80),
    "pdfUrl" VARCHAR(500),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_opportunity_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_projects" (
    "id" SERIAL NOT NULL,
    "opportunityId" INTEGER NOT NULL,
    "name" VARCHAR(220) NOT NULL,
    "budget" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costProducts" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costViaticos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costOperativo" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "margin" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "SalesProjectStatus" NOT NULL DEFAULT 'PLANNED',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_projects_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "sales_clients" ADD CONSTRAINT "sales_clients_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_clients" ADD CONSTRAINT "sales_clients_serviceClientId_fkey" FOREIGN KEY ("serviceClientId") REFERENCES "service_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_client_documents" ADD CONSTRAINT "sales_client_documents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "sales_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_client_documents" ADD CONSTRAINT "sales_client_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_leads" ADD CONSTRAINT "sales_leads_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "sales_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_leads" ADD CONSTRAINT "sales_leads_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_leads" ADD CONSTRAINT "sales_leads_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "sales_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "sales_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_opportunities" ADD CONSTRAINT "sales_opportunities_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_opportunity_notes" ADD CONSTRAINT "sales_opportunity_notes_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "sales_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_opportunity_notes" ADD CONSTRAINT "sales_opportunity_notes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_opportunity_evidences" ADD CONSTRAINT "sales_opportunity_evidences_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "sales_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_opportunity_evidences" ADD CONSTRAINT "sales_opportunity_evidences_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_opportunity_quotes" ADD CONSTRAINT "sales_opportunity_quotes_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "sales_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_opportunity_quotes" ADD CONSTRAINT "sales_opportunity_quotes_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_opportunity_quotes" ADD CONSTRAINT "sales_opportunity_quotes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_projects" ADD CONSTRAINT "sales_projects_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "sales_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
