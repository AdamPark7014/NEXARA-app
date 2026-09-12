-- CreateEnum
CREATE TYPE "ClientSector" AS ENUM ('PROYECTO', 'CORPORATIVO', 'COMERCIAL');

-- CreateTable
CREATE TABLE "sales_client_sectors" (
    "id" SERIAL NOT NULL,
    "salesClientId" INTEGER NOT NULL,
    "sector" "ClientSector" NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_client_sectors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_client_sectors_companyId_sector_idx" ON "sales_client_sectors"("companyId", "sector");

-- CreateIndex
CREATE INDEX "sales_client_sectors_sector_idx" ON "sales_client_sectors"("sector");

-- CreateIndex
CREATE UNIQUE INDEX "sales_client_sectors_salesClientId_sector_key" ON "sales_client_sectors"("salesClientId", "sector");

-- AddForeignKey
ALTER TABLE "sales_client_sectors" ADD CONSTRAINT "sales_client_sectors_salesClientId_fkey" FOREIGN KEY ("salesClientId") REFERENCES "sales_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_client_sectors" ADD CONSTRAINT "sales_client_sectors_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: con puente OPS → PROYECTO + CORPORATIVO; sin → COMERCIAL
INSERT INTO "sales_client_sectors" ("salesClientId", "sector", "companyId")
SELECT sc.id, 'PROYECTO'::"ClientSector", sc."companyId"
FROM "sales_clients" sc
WHERE sc."serviceClientId" IS NOT NULL
ON CONFLICT ("salesClientId", "sector") DO NOTHING;

INSERT INTO "sales_client_sectors" ("salesClientId", "sector", "companyId")
SELECT sc.id, 'CORPORATIVO'::"ClientSector", sc."companyId"
FROM "sales_clients" sc
WHERE sc."serviceClientId" IS NOT NULL
ON CONFLICT ("salesClientId", "sector") DO NOTHING;

INSERT INTO "sales_client_sectors" ("salesClientId", "sector", "companyId")
SELECT sc.id, 'COMERCIAL'::"ClientSector", sc."companyId"
FROM "sales_clients" sc
WHERE sc."serviceClientId" IS NULL
ON CONFLICT ("salesClientId", "sector") DO NOTHING;
