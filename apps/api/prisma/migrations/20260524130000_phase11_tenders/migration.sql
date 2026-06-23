-- Fase 11 — Licitaciones (Tenders) público / privado

CREATE TYPE "TenderType" AS ENUM ('PUBLIC_GOV', 'PRIVATE', 'INVITATION', 'CONSOLIDATED');
CREATE TYPE "TenderStatus" AS ENUM ('PROSPECT', 'IN_REVIEW', 'PREPARING_BID', 'SUBMITTED', 'AWARDED', 'LOST', 'CANCELLED', 'DISQUALIFIED');
CREATE TYPE "TenderDocumentType" AS ENUM ('CONVOCATORIA', 'BASES', 'ANEXO_TECNICO', 'PROPUESTA_TECNICA', 'PROPUESTA_ECONOMICA', 'ACTA_PRESENTACION', 'FALLO', 'CONTRATO', 'GARANTIA', 'OTRO');

CREATE TABLE "tenders" (
    "id" SERIAL NOT NULL,
    "tenderNumber" VARCHAR(60) NOT NULL,
    "title" VARCHAR(220) NOT NULL,
    "description" TEXT,
    "tenderType" "TenderType" NOT NULL DEFAULT 'PUBLIC_GOV',
    "status" "TenderStatus" NOT NULL DEFAULT 'PROSPECT',
    "conveningEntity" VARCHAR(220) NOT NULL,
    "conveningContact" VARCHAR(180),
    "conveningEmail" VARCHAR(180),
    "conveningPhone" VARCHAR(60),
    "publicationUrl" VARCHAR(500),
    "externalReference" VARCHAR(160),
    "budgetCeiling" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "ourBidAmount" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "estimatedCost" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "expectedMargin" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "guaranteeAmount" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'MXN',
    "publishDate" DATE,
    "questionsDeadline" TIMESTAMP(3),
    "submissionDeadline" TIMESTAMP(3),
    "openingDate" TIMESTAMP(3),
    "awardDate" TIMESTAMP(3),
    "contractStartDate" DATE,
    "contractEndDate" DATE,
    "scope" TEXT,
    "technicalRequirements" TEXT,
    "legalRequirements" TEXT,
    "ownerId" INTEGER,
    "salesOpportunityId" INTEGER,
    "awardedToCompetitor" VARCHAR(220),
    "awardNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tenders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenders_tenderNumber_key" ON "tenders"("tenderNumber");
CREATE UNIQUE INDEX "tenders_salesOpportunityId_key" ON "tenders"("salesOpportunityId");
CREATE INDEX "tenders_status_submissionDeadline_idx" ON "tenders"("status", "submissionDeadline");
CREATE INDEX "tenders_tenderType_idx" ON "tenders"("tenderType");

CREATE TABLE "tender_documents" (
    "id" SERIAL NOT NULL,
    "tenderId" INTEGER NOT NULL,
    "documentType" "TenderDocumentType" NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "url" VARCHAR(500),
    "uploadedBy" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tender_documents_tenderId_documentType_idx" ON "tender_documents"("tenderId", "documentType");

CREATE TABLE "tender_events" (
    "id" SERIAL NOT NULL,
    "tenderId" INTEGER NOT NULL,
    "eventName" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "occursAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tender_events_tenderId_occursAt_idx" ON "tender_events"("tenderId", "occursAt");

ALTER TABLE "tenders"
  ADD CONSTRAINT "tenders_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "tenders_salesOpportunityId_fkey" FOREIGN KEY ("salesOpportunityId") REFERENCES "sales_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tender_documents"
  ADD CONSTRAINT "tender_documents_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tender_events"
  ADD CONSTRAINT "tender_events_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
