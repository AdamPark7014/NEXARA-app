-- Personalización de cotizaciones (pedido de Adam: «mayor personalización»).
--
-- Solo agrega: ninguna columna existente cambia y sin opciones guardadas el PDF sale como antes.
--
-- 1. `cotizaciones.opciones`: secciones incluidas, columnas de la tabla, carta de presentación,
--    condiciones comerciales, nota de tipo de cambio y firmas (`cotizaciones/personalizacion.ts`).
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "opciones" JSONB;

-- 2. Imagen del producto por partida (columna opcional «Imagen» del PDF).
ALTER TABLE "cotizacion_items" ADD COLUMN IF NOT EXISTS "imagenUrl" VARCHAR(500);

-- 3. Plantillas de cotización por empresa.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CotizacionSegmento') THEN
    CREATE TYPE "CotizacionSegmento" AS ENUM ('COMERCIAL', 'OBRA', 'LICITACION', 'SERVICIO');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "cotizacion_plantillas" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "nombre" VARCHAR(120) NOT NULL,
  "segmento" "CotizacionSegmento" NOT NULL DEFAULT 'COMERCIAL',
  "contenido" JSONB NOT NULL,
  "conPartidas" BOOLEAN NOT NULL DEFAULT false,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivadaAt" TIMESTAMP(3),
  CONSTRAINT "cotizacion_plantillas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "cotizacion_plantillas_companyId_idx" ON "cotizacion_plantillas"("companyId");
