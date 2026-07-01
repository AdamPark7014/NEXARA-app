-- Datos fiscales CFDI en cliente comercial (CRM → facturación)
ALTER TABLE "sales_clients" ADD COLUMN IF NOT EXISTS "fiscalZipCode" VARCHAR(5);
ALTER TABLE "sales_clients" ADD COLUMN IF NOT EXISTS "fiscalRegime" VARCHAR(10);
