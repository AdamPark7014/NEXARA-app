-- InventorySnapshot.companyId for tenant middleware + IDOR hardening

ALTER TABLE "inventory_snapshots" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_id IS NOT NULL THEN
    UPDATE "inventory_snapshots" s
      SET "companyId" = COALESCE(
        (SELECT c."companyId" FROM "service_clients" c WHERE c.id = s."clientId"),
        (SELECT a."companyId" FROM "Activity" a WHERE a.id = s."activityId"),
        (SELECT r."companyId" FROM "client_ticket_requests" r WHERE r.id = s."requestId"),
        primary_id
      )
      WHERE s."companyId" IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "company_profile" LIMIT 1) THEN
    ALTER TABLE "inventory_snapshots" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_snapshots_companyId_fkey') THEN
    ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "inventory_snapshots_companyId_idx" ON "inventory_snapshots"("companyId");
