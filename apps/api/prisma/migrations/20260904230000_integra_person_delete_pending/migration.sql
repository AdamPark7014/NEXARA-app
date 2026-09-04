-- Tombstones for force/partial ACS person deletes (sync must not reimport).
CREATE TABLE IF NOT EXISTS "integra_person_delete_pending" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "personId" VARCHAR(120) NOT NULL,
    "personName" VARCHAR(220),
    "failedIps" JSONB NOT NULL,
    "force" BOOLEAN NOT NULL DEFAULT false,
    "note" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integra_person_delete_pending_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "integra_person_delete_pending_siteId_personId_key"
  ON "integra_person_delete_pending"("siteId", "personId");

CREATE INDEX IF NOT EXISTS "integra_person_delete_pending_companyId_siteId_idx"
  ON "integra_person_delete_pending"("companyId", "siteId");

ALTER TABLE "integra_person_delete_pending"
  DROP CONSTRAINT IF EXISTS "integra_person_delete_pending_companyId_fkey";
ALTER TABLE "integra_person_delete_pending"
  ADD CONSTRAINT "integra_person_delete_pending_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "company_profile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "integra_person_delete_pending"
  DROP CONSTRAINT IF EXISTS "integra_person_delete_pending_siteId_fkey";
ALTER TABLE "integra_person_delete_pending"
  ADD CONSTRAINT "integra_person_delete_pending_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "integra_sites"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
