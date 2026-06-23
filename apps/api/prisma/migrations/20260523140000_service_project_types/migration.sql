-- Tipos de proyecto de servicio + catálogo
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServiceProjectType') THEN
    CREATE TYPE "ServiceProjectType" AS ENUM (
      'INSTALACION_CCTV',
      'CABLEADO_ESTRUCTURADO',
      'CONTROL_ACCESO',
      'REDES_WIFI',
      'COMPUTO',
      'AUDITORIA_NODOS',
      'MANTENIMIENTO',
      'SUSTITUCION_EQUIPOS',
      'PROYECTO_INTEGRAL',
      'OTRO'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CatalogItemType') THEN
    CREATE TYPE "CatalogItemType" AS ENUM ('PRODUCT', 'SERVICE', 'LABOR', 'BUNDLE');
  END IF;
END $$;

ALTER TABLE IF EXISTS "products" ADD COLUMN IF NOT EXISTS "itemType" "CatalogItemType" NOT NULL DEFAULT 'PRODUCT';
ALTER TABLE IF EXISTS "ProductCT" ADD COLUMN IF NOT EXISTS "itemType" "CatalogItemType" NOT NULL DEFAULT 'PRODUCT';

ALTER TABLE IF EXISTS "operational_projects" ADD COLUMN IF NOT EXISTS "projectType" "ServiceProjectType" NOT NULL DEFAULT 'OTRO';
ALTER TABLE IF EXISTS "operational_projects" ADD COLUMN IF NOT EXISTS "scopeSummary" TEXT;
ALTER TABLE IF EXISTS "operational_projects" ADD COLUMN IF NOT EXISTS "siteCount" INTEGER;
ALTER TABLE IF EXISTS "operational_projects" ADD COLUMN IF NOT EXISTS "salesProjectId" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "operational_projects_salesProjectId_key" ON "operational_projects"("salesProjectId");

ALTER TABLE IF EXISTS "sales_projects" ADD COLUMN IF NOT EXISTS "projectType" "ServiceProjectType" NOT NULL DEFAULT 'OTRO';
ALTER TABLE IF EXISTS "sales_projects" ADD COLUMN IF NOT EXISTS "scopeSummary" TEXT;
ALTER TABLE IF EXISTS "sales_projects" ADD COLUMN IF NOT EXISTS "siteCount" INTEGER;
