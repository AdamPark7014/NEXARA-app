-- Link cotizaciones to ERP commercial spine (optional FKs; legacy string fields remain)
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "salesClientId" INTEGER;
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "opportunityId" INTEGER;

CREATE INDEX IF NOT EXISTS "cotizaciones_salesClientId_idx" ON "cotizaciones"("salesClientId");
CREATE INDEX IF NOT EXISTS "cotizaciones_opportunityId_idx" ON "cotizaciones"("opportunityId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cotizaciones_salesClientId_fkey'
  ) THEN
    ALTER TABLE "cotizaciones"
      ADD CONSTRAINT "cotizaciones_salesClientId_fkey"
      FOREIGN KEY ("salesClientId") REFERENCES "sales_clients"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cotizaciones_opportunityId_fkey'
  ) THEN
    ALTER TABLE "cotizaciones"
      ADD CONSTRAINT "cotizaciones_opportunityId_fkey"
      FOREIGN KEY ("opportunityId") REFERENCES "sales_opportunities"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
