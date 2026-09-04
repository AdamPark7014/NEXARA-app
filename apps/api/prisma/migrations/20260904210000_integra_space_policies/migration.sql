-- Plantillas de vigencia por espacio/puerta (política ACS, no calendar ERP).
CREATE TABLE "integra_space_policies" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "doorIndexCode" VARCHAR(120) NOT NULL,
    "templateKey" VARCHAR(32) NOT NULL DEFAULT 'INDEFINITE',
    "label" VARCHAR(160),
    "config" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integra_space_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integra_space_policies_siteId_doorIndexCode_key" ON "integra_space_policies"("siteId", "doorIndexCode");
CREATE INDEX "integra_space_policies_companyId_idx" ON "integra_space_policies"("companyId");

ALTER TABLE "integra_space_policies" ADD CONSTRAINT "integra_space_policies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integra_space_policies" ADD CONSTRAINT "integra_space_policies_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "integra_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
