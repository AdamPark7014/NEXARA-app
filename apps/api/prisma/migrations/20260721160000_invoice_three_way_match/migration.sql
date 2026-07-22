-- P1: 3-way match PO–GR–factura AP

DO $$ BEGIN
  CREATE TYPE "InvoiceMatchStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'MATCHED', 'VARIANCE', 'WAIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "matchStatus" "InvoiceMatchStatus" NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "matchedAt" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "matchedById" INTEGER;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "matchNotes" VARCHAR(500);

ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "purchaseOrderItemId" INTEGER;
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "goodsReceiptItemId" INTEGER;

CREATE INDEX IF NOT EXISTS "invoices_matchStatus_idx" ON "invoices"("matchStatus");
CREATE INDEX IF NOT EXISTS "invoice_items_purchaseOrderItemId_idx" ON "invoice_items"("purchaseOrderItemId");
CREATE INDEX IF NOT EXISTS "invoice_items_goodsReceiptItemId_idx" ON "invoice_items"("goodsReceiptItemId");

DO $$ BEGIN
  ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_matchedById_fkey"
    FOREIGN KEY ("matchedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "invoice_items"
    ADD CONSTRAINT "invoice_items_purchaseOrderItemId_fkey"
    FOREIGN KEY ("purchaseOrderItemId") REFERENCES "purchase_order_items"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "invoice_items"
    ADD CONSTRAINT "invoice_items_goodsReceiptItemId_fkey"
    FOREIGN KEY ("goodsReceiptItemId") REFERENCES "goods_receipt_items"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
