-- Work project children, ToolRenewal, Budget, GoodsReceipt tenant stamps

ALTER TABLE "work_project_expenses" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "work_project_payroll" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "work_project_logs" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "tool_renewals" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;

DO $$
DECLARE
  primary_id INTEGER;
BEGIN
  SELECT id INTO primary_id FROM "company_profile" WHERE "isPrimary" = true ORDER BY id ASC LIMIT 1;
  IF primary_id IS NULL THEN
    SELECT id INTO primary_id FROM "company_profile" ORDER BY id ASC LIMIT 1;
  END IF;
  IF primary_id IS NOT NULL THEN
    UPDATE "work_project_expenses" e
      SET "companyId" = COALESCE(
        (SELECT wp."companyId" FROM "work_projects" wp WHERE wp.id = e."projectId"),
        primary_id
      )
      WHERE e."companyId" IS NULL;

    UPDATE "work_project_payroll" p
      SET "companyId" = COALESCE(
        (SELECT wp."companyId" FROM "work_projects" wp WHERE wp.id = p."projectId"),
        primary_id
      )
      WHERE p."companyId" IS NULL;

    UPDATE "work_project_logs" l
      SET "companyId" = COALESCE(
        (SELECT wp."companyId" FROM "work_projects" wp WHERE wp.id = l."projectId"),
        primary_id
      )
      WHERE l."companyId" IS NULL;

    UPDATE "tool_renewals" tr
      SET "companyId" = COALESCE(
        (SELECT t."companyId" FROM "tool_requests" t WHERE t.id = tr."toolRequestId"),
        primary_id
      )
      WHERE tr."companyId" IS NULL;

    UPDATE "budgets" b
      SET "companyId" = COALESCE(
        (SELECT cc."companyId" FROM "cost_centers" cc WHERE cc.id = b."costCenterId"),
        primary_id
      )
      WHERE b."companyId" IS NULL;

    UPDATE "goods_receipts" gr
      SET "companyId" = COALESCE(
        (SELECT po."companyId" FROM "purchase_orders" po WHERE po.id = gr."purchaseOrderId"),
        primary_id
      )
      WHERE gr."companyId" IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "company_profile" LIMIT 1) THEN
    ALTER TABLE "work_project_expenses" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "work_project_payroll" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "work_project_logs" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "tool_renewals" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "budgets" ALTER COLUMN "companyId" SET NOT NULL;
    ALTER TABLE "goods_receipts" ALTER COLUMN "companyId" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budgets_costCenterId_year_month_key') THEN
    ALTER TABLE "budgets" DROP CONSTRAINT "budgets_costCenterId_year_month_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goods_receipts_receiptNumber_key') THEN
    ALTER TABLE "goods_receipts" DROP CONSTRAINT "goods_receipts_receiptNumber_key";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_project_expenses_companyId_fkey') THEN
    ALTER TABLE "work_project_expenses" ADD CONSTRAINT "work_project_expenses_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_project_payroll_companyId_fkey') THEN
    ALTER TABLE "work_project_payroll" ADD CONSTRAINT "work_project_payroll_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_project_logs_companyId_fkey') THEN
    ALTER TABLE "work_project_logs" ADD CONSTRAINT "work_project_logs_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tool_renewals_companyId_fkey') THEN
    ALTER TABLE "tool_renewals" ADD CONSTRAINT "tool_renewals_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budgets_companyId_fkey') THEN
    ALTER TABLE "budgets" ADD CONSTRAINT "budgets_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goods_receipts_companyId_fkey') THEN
    ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "budgets_companyId_costCenterId_year_month_key"
  ON "budgets"("companyId", "costCenterId", "year", "month");
CREATE UNIQUE INDEX IF NOT EXISTS "goods_receipts_companyId_receiptNumber_key"
  ON "goods_receipts"("companyId", "receiptNumber");

CREATE INDEX IF NOT EXISTS "work_project_expenses_companyId_idx" ON "work_project_expenses"("companyId");
CREATE INDEX IF NOT EXISTS "work_project_payroll_companyId_idx" ON "work_project_payroll"("companyId");
CREATE INDEX IF NOT EXISTS "work_project_logs_companyId_idx" ON "work_project_logs"("companyId");
CREATE INDEX IF NOT EXISTS "tool_renewals_companyId_idx" ON "tool_renewals"("companyId");
CREATE INDEX IF NOT EXISTS "budgets_companyId_idx" ON "budgets"("companyId");
CREATE INDEX IF NOT EXISTS "goods_receipts_companyId_idx" ON "goods_receipts"("companyId");
