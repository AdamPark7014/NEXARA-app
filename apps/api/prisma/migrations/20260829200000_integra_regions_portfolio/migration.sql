-- AlterTable
ALTER TABLE "integra_sites" ADD COLUMN "serviceClientId" INTEGER,
ADD COLUMN "modulesOverride" JSONB,
ADD COLUMN "label" VARCHAR(120),
ADD COLUMN "notes" TEXT;

-- CreateTable
CREATE TABLE "integra_regions" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "indexCode" VARCHAR(120) NOT NULL,
    "name" VARCHAR(220) NOT NULL,
    "parentIndexCode" VARCHAR(120),
    "raw" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integra_regions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integra_regions_siteId_indexCode_key" ON "integra_regions"("siteId", "indexCode");
CREATE INDEX "integra_regions_companyId_idx" ON "integra_regions"("companyId");

ALTER TABLE "integra_regions" ADD CONSTRAINT "integra_regions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integra_regions" ADD CONSTRAINT "integra_regions_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "integra_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
