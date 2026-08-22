-- Homologación mayoristas + pedidos CT desde cotización
ALTER TABLE "cotizacion_items" ADD COLUMN IF NOT EXISTS "supplierCode" VARCHAR(20);

CREATE TABLE IF NOT EXISTS "supplier_purchase_orders" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "cotizacionId" INTEGER,
    "supplierCode" VARCHAR(40) NOT NULL,
    "idPedido" INTEGER NOT NULL,
    "almacen" VARCHAR(10) NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
    "externalFolio" VARCHAR(40),
    "confirmedAt" TIMESTAMP(3),
    "requestPayload" JSONB NOT NULL,
    "responsePayload" JSONB,
    "errorMessage" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_purchase_orders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "supplier_purchase_orders_companyId_supplierCode_idx"
  ON "supplier_purchase_orders"("companyId", "supplierCode");
CREATE INDEX IF NOT EXISTS "supplier_purchase_orders_cotizacionId_idx"
  ON "supplier_purchase_orders"("cotizacionId");

DO $$ BEGIN
  ALTER TABLE "supplier_purchase_orders"
    ADD CONSTRAINT "supplier_purchase_orders_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "supplier_purchase_orders"
    ADD CONSTRAINT "supplier_purchase_orders_cotizacionId_fkey"
    FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "supplier_purchase_orders"
    ADD CONSTRAINT "supplier_purchase_orders_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
