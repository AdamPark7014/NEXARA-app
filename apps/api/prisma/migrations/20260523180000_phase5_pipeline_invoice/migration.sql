-- Extend pipeline stages for kanban alignment
ALTER TYPE "SalesOpportunityStage" ADD VALUE IF NOT EXISTS 'QUALIFICATION';
ALTER TYPE "SalesOpportunityStage" ADD VALUE IF NOT EXISTS 'CLOSING';

-- Invoice link to sales project order
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "salesProjectOrderId" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_salesProjectOrderId_key" ON "invoices"("salesProjectOrderId");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_salesProjectOrderId_fkey" FOREIGN KEY ("salesProjectOrderId") REFERENCES "sales_project_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invoice item link to order line snapshot
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "salesOrderLineId" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_items_salesOrderLineId_key" ON "invoice_items"("salesOrderLineId");
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "sales_project_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
