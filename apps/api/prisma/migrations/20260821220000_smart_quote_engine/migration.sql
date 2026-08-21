-- Smart Quote Engine: CT catalog indexes, quote cost fields, labor/rules/logistics/versioning

CREATE UNIQUE INDEX IF NOT EXISTS "productos_ct_clave_key" ON "productos_ct"("clave");
CREATE INDEX IF NOT EXISTS "productos_ct_idProducto_idx" ON "productos_ct"("idProducto");
CREATE INDEX IF NOT EXISTS "productos_ct_marca_idx" ON "productos_ct"("marca");
CREATE INDEX IF NOT EXISTS "productos_ct_categoria_idx" ON "productos_ct"("categoria");
CREATE INDEX IF NOT EXISTS "productos_ct_nombre_idx" ON "productos_ct"("nombre");

CREATE TABLE IF NOT EXISTS "supplier_catalog_sync_runs" (
    "id" SERIAL NOT NULL,
    "supplierCode" VARCHAR(40) NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "rowsRead" INTEGER NOT NULL DEFAULT 0,
    "rowsUpserted" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "fileModifiedAt" VARCHAR(80),
    "checksum" VARCHAR(64),
    "companyId" INTEGER,
    CONSTRAINT "supplier_catalog_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "supplier_catalog_sync_runs_supplierCode_startedAt_idx"
  ON "supplier_catalog_sync_runs"("supplierCode", "startedAt");
CREATE INDEX IF NOT EXISTS "supplier_catalog_sync_runs_companyId_idx"
  ON "supplier_catalog_sync_runs"("companyId");

ALTER TABLE "cotizacion_items" ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(12,2);
ALTER TABLE "cotizacion_items" ADD COLUMN IF NOT EXISTS "supplierId" INTEGER;
ALTER TABLE "cotizacion_items" ADD COLUMN IF NOT EXISTS "supplierSku" VARCHAR(120);
ALTER TABLE "cotizacion_items" ADD COLUMN IF NOT EXISTS "productCtId" INTEGER;
ALTER TABLE "cotizacion_items" ADD COLUMN IF NOT EXISTS "marginPercent" DECIMAL(7,2);
ALTER TABLE "cotizacion_items" ADD COLUMN IF NOT EXISTS "stockSnapshot" INTEGER;
ALTER TABLE "cotizacion_items" ADD COLUMN IF NOT EXISTS "leadTimeDays" INTEGER;
ALTER TABLE "cotizacion_items" ADD COLUMN IF NOT EXISTS "scoreReason" VARCHAR(40);
ALTER TABLE "cotizacion_items" ADD COLUMN IF NOT EXISTS "optimizationMode" VARCHAR(20);

CREATE INDEX IF NOT EXISTS "cotizacion_items_productCtId_idx" ON "cotizacion_items"("productCtId");
CREATE INDEX IF NOT EXISTS "cotizacion_items_supplierId_idx" ON "cotizacion_items"("supplierId");

CREATE TABLE IF NOT EXISTS "cotizacion_versions" (
    "id" SERIAL NOT NULL,
    "cotizacionId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "note" VARCHAR(255),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cotizacion_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cotizacion_versions_cotizacionId_version_key"
  ON "cotizacion_versions"("cotizacionId", "version");
CREATE INDEX IF NOT EXISTS "cotizacion_versions_cotizacionId_idx"
  ON "cotizacion_versions"("cotizacionId");

CREATE TABLE IF NOT EXISTS "labor_rate_cards" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "unit" VARCHAR(20) NOT NULL DEFAULT 'PIECE',
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "marginPercent" DECIMAL(7,2),
    "defaultHours" DECIMAL(10,2),
    "technicians" INTEGER NOT NULL DEFAULT 1,
    "matchCategory" VARCHAR(120),
    "matchSubcategory" VARCHAR(120),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "labor_rate_cards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "labor_rate_cards_companyId_code_key"
  ON "labor_rate_cards"("companyId", "code");
CREATE INDEX IF NOT EXISTS "labor_rate_cards_companyId_idx" ON "labor_rate_cards"("companyId");

CREATE TABLE IF NOT EXISTS "labor_rules" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "rateCardId" INTEGER NOT NULL,
    "formula" VARCHAR(40) NOT NULL DEFAULT 'PER_QTY',
    "params" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "labor_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "labor_rules_companyId_idx" ON "labor_rules"("companyId");
CREATE INDEX IF NOT EXISTS "labor_rules_rateCardId_idx" ON "labor_rules"("rateCardId");

CREATE TABLE IF NOT EXISTS "commercial_rules" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "scope" VARCHAR(40) NOT NULL DEFAULT 'GLOBAL',
    "scopeValue" VARCHAR(120),
    "minMarginPercent" DECIMAL(7,2),
    "maxDiscountPercent" DECIMAL(7,2),
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "commercial_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "commercial_rules_companyId_idx" ON "commercial_rules"("companyId");

CREATE TABLE IF NOT EXISTS "logistics_zone_rates" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "zoneCode" VARCHAR(40) NOT NULL,
    "zoneName" VARCHAR(120) NOT NULL,
    "baseCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "basePrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "perKmCost" DECIMAL(12,2),
    "perKgCost" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "logistics_zone_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "logistics_zone_rates_companyId_zoneCode_key"
  ON "logistics_zone_rates"("companyId", "zoneCode");
CREATE INDEX IF NOT EXISTS "logistics_zone_rates_companyId_idx" ON "logistics_zone_rates"("companyId");

DO $$ BEGIN
  ALTER TABLE "supplier_catalog_sync_runs"
    ADD CONSTRAINT "supplier_catalog_sync_runs_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "cotizacion_items"
    ADD CONSTRAINT "cotizacion_items_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "cotizacion_versions"
    ADD CONSTRAINT "cotizacion_versions_cotizacionId_fkey"
    FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "cotizacion_versions"
    ADD CONSTRAINT "cotizacion_versions_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "labor_rate_cards"
    ADD CONSTRAINT "labor_rate_cards_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "labor_rules"
    ADD CONSTRAINT "labor_rules_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "labor_rules"
    ADD CONSTRAINT "labor_rules_rateCardId_fkey"
    FOREIGN KEY ("rateCardId") REFERENCES "labor_rate_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "commercial_rules"
    ADD CONSTRAINT "commercial_rules_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "logistics_zone_rates"
    ADD CONSTRAINT "logistics_zone_rates_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
