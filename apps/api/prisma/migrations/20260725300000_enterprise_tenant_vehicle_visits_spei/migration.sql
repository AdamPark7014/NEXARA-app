-- VehicleControl + MaintenanceContractVisit.companyId; BankTransaction SPEI per account

ALTER TABLE "VehicleControl" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "maintenance_contract_visits" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;

  IF primary_id IS NOT NULL THEN
    UPDATE "VehicleControl" vc
      SET "companyId" = COALESCE(
        (SELECT a."companyId" FROM "Activity" a WHERE a.id = vc."actividadId"),
        (SELECT va."companyId" FROM "VehicleAsset" va WHERE va.id = vc."vehicleId"),
        primary_id
      )
      WHERE vc."companyId" IS NULL;

    UPDATE "maintenance_contract_visits" v
      SET "companyId" = COALESCE(
        (SELECT c."companyId" FROM "maintenance_contracts" c WHERE c.id = v."contractId"),
        primary_id
      )
      WHERE v."companyId" IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "company_profile" LIMIT 1) THEN
    ALTER TABLE "VehicleControl" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "maintenance_contract_visits" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VehicleControl_companyId_fkey') THEN
    ALTER TABLE "VehicleControl" ADD CONSTRAINT "VehicleControl_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_contract_visits_companyId_fkey') THEN
    ALTER TABLE "maintenance_contract_visits" ADD CONSTRAINT "maintenance_contract_visits_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "VehicleControl_companyId_idx" ON "VehicleControl"("companyId");
CREATE INDEX IF NOT EXISTS "maintenance_contract_visits_companyId_idx" ON "maintenance_contract_visits"("companyId");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_speiTrackingKey_key') THEN
    ALTER TABLE "bank_transactions" DROP CONSTRAINT "bank_transactions_speiTrackingKey_key";
  END IF;
END $$;
DROP INDEX IF EXISTS "bank_transactions_speiTrackingKey_key";

CREATE UNIQUE INDEX IF NOT EXISTS "bank_transactions_bankAccountId_speiTrackingKey_key"
  ON "bank_transactions"("bankAccountId", "speiTrackingKey");
