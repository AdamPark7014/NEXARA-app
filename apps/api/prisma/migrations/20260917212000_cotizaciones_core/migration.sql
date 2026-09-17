-- Cotizaciones en Core (contrato del viernes, sección D).
--
-- Folio del servidor basado en la nomenclatura de quien cotiza (`NEX-LJ75100126-0007`) con contador
-- por persona; segmento como campo; participantes; estados RECHAZADA/VENCIDA; y la actividad
-- comercial que **es** una cotización.
--
-- Compatibilidad: las cotizaciones que ya existen conservan su folio tal cual (`quoteNumber` no se
-- toca) y quedan en segmento COMERCIAL, que es lo que eran.

-- 1. Estados nuevos sobre el enum que ya existe (DRAFT/SENT/APPROVED siguen siendo válidos).
ALTER TYPE "CotizacionStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "CotizacionStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- 2. Segmento y papel de cada participante.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CotizacionSegmento') THEN
    CREATE TYPE "CotizacionSegmento" AS ENUM ('COMERCIAL', 'OBRA', 'LICITACION', 'SERVICIO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CotizacionParticipanteRol') THEN
    CREATE TYPE "CotizacionParticipanteRol" AS ENUM ('ELABORO', 'LEVANTAMIENTO', 'REVISO', 'APROBO', 'ENVIO');
  END IF;
END
$$;

-- 3. Columnas nuevas de la cotización.
--    El folio enviado agrega cadena de participantes y revisión, así que `quoteNumber` necesita
--    más de 40 caracteres.
ALTER TABLE "cotizaciones" ALTER COLUMN "quoteNumber" TYPE VARCHAR(80);
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "segmento" "CotizacionSegmento" NOT NULL DEFAULT 'COMERCIAL';
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "folioNomenclatura" VARCHAR(20);
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "folioConsecutivo" INTEGER;
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "folioEnviado" VARCHAR(120);
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "objetivo" TEXT;
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "alcanceBloques" JSONB;
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "planos" JSONB;
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3);
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "rejectedReason" TEXT;
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "rejectedByName" VARCHAR(180);
ALTER TABLE "cotizaciones" ADD COLUMN IF NOT EXISTS "expiredAt" TIMESTAMP(3);

-- Las que ya salieron al cliente cuentan como primer envío.
UPDATE "cotizaciones" SET "revision" = 1 WHERE "revision" IS NULL;
UPDATE "cotizaciones" SET "folioEnviado" = "quoteNumber" WHERE "sentAt" IS NOT NULL AND "folioEnviado" IS NULL;

-- 4. Grupo y paquete de cada partida.
ALTER TABLE "cotizacion_items" ADD COLUMN IF NOT EXISTS "grupo" VARCHAR(20);
ALTER TABLE "cotizacion_items" ADD COLUMN IF NOT EXISTS "paqueteClave" VARCHAR(60);
ALTER TABLE "cotizacion_items" ADD COLUMN IF NOT EXISTS "paqueteCantidad" INTEGER;

-- 5. Participantes.
CREATE TABLE IF NOT EXISTS "cotizacion_participantes" (
    "id" SERIAL NOT NULL,
    "cotizacionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "clave" VARCHAR(20) NOT NULL,
    "siglas" VARCHAR(4) NOT NULL,
    "rol" "CotizacionParticipanteRol" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizacion_participantes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cotizacion_participantes_cotizacionId_userId_rol_key"
  ON "cotizacion_participantes"("cotizacionId", "userId", "rol");
CREATE INDEX IF NOT EXISTS "cotizacion_participantes_cotizacionId_idx" ON "cotizacion_participantes"("cotizacionId");
CREATE INDEX IF NOT EXISTS "cotizacion_participantes_userId_idx" ON "cotizacion_participantes"("userId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cotizacion_participantes_cotizacionId_fkey') THEN
    ALTER TABLE "cotizacion_participantes"
      ADD CONSTRAINT "cotizacion_participantes_cotizacionId_fkey"
      FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cotizacion_participantes_userId_fkey') THEN
    ALTER TABLE "cotizacion_participantes"
      ADD CONSTRAINT "cotizacion_participantes_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- 6. Contador de folios por persona.
CREATE TABLE IF NOT EXISTS "cotizacion_contadores" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizacion_contadores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cotizacion_contadores_userId_key" ON "cotizacion_contadores"("userId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cotizacion_contadores_userId_fkey') THEN
    ALTER TABLE "cotizacion_contadores"
      ADD CONSTRAINT "cotizacion_contadores_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- 7. La actividad comercial que es una cotización.
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "cotizacionId" INTEGER;
CREATE INDEX IF NOT EXISTS "Activity_cotizacionId_idx" ON "Activity"("cotizacionId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Activity_cotizacionId_fkey') THEN
    ALTER TABLE "Activity"
      ADD CONSTRAINT "Activity_cotizacionId_fkey"
      FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
