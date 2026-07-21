-- NEXARA: GR → warehouse + AP invoice links + journal FK

ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "warehouseId" INTEGER;
ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "journalEntryId" INTEGER;

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "purchaseOrderId" INTEGER;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "goodsReceiptId" INTEGER;

CREATE INDEX IF NOT EXISTS "goods_receipts_warehouseId_idx" ON "goods_receipts"("warehouseId");
CREATE INDEX IF NOT EXISTS "invoices_purchaseOrderId_idx" ON "invoices"("purchaseOrderId");
CREATE INDEX IF NOT EXISTS "invoices_goodsReceiptId_idx" ON "invoices"("goodsReceiptId");

DO $$ BEGIN
  ALTER TABLE "goods_receipts"
    ADD CONSTRAINT "goods_receipts_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "goods_receipts"
    ADD CONSTRAINT "goods_receipts_journalEntryId_fkey"
    FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_goodsReceiptId_fkey"
    FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
