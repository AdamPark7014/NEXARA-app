-- Fase 3: roles organizacionales + catálogo en cotizaciones
ALTER TABLE IF EXISTS "roles" ADD COLUMN IF NOT EXISTS "orgRoleKey" VARCHAR(40);
ALTER TABLE IF EXISTS "roles" ADD COLUMN IF NOT EXISTS "accesoRRHH" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS "roles" ADD COLUMN IF NOT EXISTS "accesoCatalogo" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS "Role" ADD COLUMN IF NOT EXISTS "orgRoleKey" VARCHAR(40);
ALTER TABLE IF EXISTS "Role" ADD COLUMN IF NOT EXISTS "accesoRRHH" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS "Role" ADD COLUMN IF NOT EXISTS "accesoCatalogo" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS "cotizacion_items" ADD COLUMN IF NOT EXISTS "productId" INTEGER;

DO $$
BEGIN
  IF to_regclass('public.cotizacion_items') IS NOT NULL
     AND to_regclass('public.products') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'cotizacion_items_productId_fkey'
     ) THEN
    ALTER TABLE "cotizacion_items"
      ADD CONSTRAINT "cotizacion_items_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  ELSIF to_regclass('public.cotizacion_items') IS NOT NULL
     AND to_regclass('public.ProductCT') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'cotizacion_items_productId_fkey'
     ) THEN
    ALTER TABLE "cotizacion_items"
      ADD CONSTRAINT "cotizacion_items_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "ProductCT"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
