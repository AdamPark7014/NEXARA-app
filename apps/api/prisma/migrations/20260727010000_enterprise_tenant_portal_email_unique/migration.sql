-- Per-tenant portalEmail uniqueness (ServiceClient + ServiceClientBranch)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_clients_portalEmail_key') THEN
    ALTER TABLE "service_clients" DROP CONSTRAINT "service_clients_portalEmail_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_client_branches_portalEmail_key') THEN
    ALTER TABLE "service_client_branches" DROP CONSTRAINT "service_client_branches_portalEmail_key";
  END IF;
END $$;

DROP INDEX IF EXISTS "service_clients_portalEmail_key";
DROP INDEX IF EXISTS "service_client_branches_portalEmail_key";

-- PG treats NULLs as distinct in unique indexes, so rows without portalEmail stay fine.
CREATE UNIQUE INDEX IF NOT EXISTS "service_clients_companyId_portalEmail_key"
  ON "service_clients"("companyId", "portalEmail");

CREATE UNIQUE INDEX IF NOT EXISTS "service_client_branches_companyId_portalEmail_key"
  ON "service_client_branches"("companyId", "portalEmail");
