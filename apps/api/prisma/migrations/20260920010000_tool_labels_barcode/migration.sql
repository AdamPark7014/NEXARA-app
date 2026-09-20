-- Etiquetas de herramientas: código interno + barcode
ALTER TABLE "tool_inventory_items" ADD COLUMN IF NOT EXISTS "codigoInterno" VARCHAR(64);
ALTER TABLE "tool_inventory_items" ADD COLUMN IF NOT EXISTS "barcode" VARCHAR(64);
CREATE INDEX IF NOT EXISTS "tool_inventory_items_barcode_idx" ON "tool_inventory_items"("barcode");
CREATE INDEX IF NOT EXISTS "tool_inventory_items_codigoInterno_idx" ON "tool_inventory_items"("codigoInterno");
