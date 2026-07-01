-- Orden de venta: varias facturas por proyecto (facturación parcial)
DROP INDEX IF EXISTS "invoices_salesProjectOrderId_key";

-- Catálogo SAT en productos (CFDI México)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "satProductKey" VARCHAR(10);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "satUnitKey" VARCHAR(5);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "unitName" VARCHAR(50);
