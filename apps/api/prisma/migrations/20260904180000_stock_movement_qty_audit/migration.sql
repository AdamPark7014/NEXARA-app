-- Auditoría hiper-detallada: saldo origen/destino antes y después de cada movimiento.
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "fromQtyBefore" DECIMAL(14,4);
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "fromQtyAfter" DECIMAL(14,4);
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "toQtyBefore" DECIMAL(14,4);
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "toQtyAfter" DECIMAL(14,4);
