-- Visitas recurrentes ISAPI: vigencia Valid + franjas WeekPlan en puertas limitadas.
CREATE TABLE "integra_recurring_visitors" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "visitorName" VARCHAR(220) NOT NULL,
    "phone" VARCHAR(40),
    "hostPersonId" VARCHAR(120),
    "hostName" VARCHAR(220),
    "employeeNo" VARCHAR(32) NOT NULL,
    "doorIndexCodes" JSONB NOT NULL,
    "weekdays" JSONB NOT NULL,
    "timeFrom" VARCHAR(8) NOT NULL,
    "timeTo" VARCHAR(8) NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "planTemplateNo" VARCHAR(8) NOT NULL DEFAULT '10',
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "hasFace" BOOLEAN NOT NULL DEFAULT false,
    "lastPushAt" TIMESTAMP(3),
    "lastError" TEXT,
    "notes" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integra_recurring_visitors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integra_recurring_visitors_siteId_employeeNo_key" ON "integra_recurring_visitors"("siteId", "employeeNo");
CREATE INDEX "integra_recurring_visitors_companyId_status_idx" ON "integra_recurring_visitors"("companyId", "status");
CREATE INDEX "integra_recurring_visitors_siteId_status_validTo_idx" ON "integra_recurring_visitors"("siteId", "status", "validTo");

ALTER TABLE "integra_recurring_visitors" ADD CONSTRAINT "integra_recurring_visitors_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integra_recurring_visitors" ADD CONSTRAINT "integra_recurring_visitors_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "integra_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
