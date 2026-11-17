-- Contadora ola 1: buzon SAT, 69-B, propuestas de poliza, lectura de tickets

ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "lista69B" VARCHAR(20);
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "lista69BActualizadoAt" TIMESTAMP(3);

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "ivaRetenido" DECIMAL(14,2);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "isrRetenido" DECIMAL(14,2);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "origenSat" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "satEstatus" VARCHAR(20);

ALTER TABLE "viatico_tickets" ADD COLUMN IF NOT EXISTS "litros" DECIMAL(10,3);
ALTER TABLE "viatico_tickets" ADD COLUMN IF NOT EXISTS "precioLitro" DECIMAL(10,4);
ALTER TABLE "viatico_tickets" ADD COLUMN IF NOT EXISTS "combustible" VARCHAR(40);
ALTER TABLE "viatico_tickets" ADD COLUMN IF NOT EXISTS "folioTicket" VARCHAR(80);
ALTER TABLE "viatico_tickets" ADD COLUMN IF NOT EXISTS "webFacturacion" VARCHAR(500);
ALTER TABLE "viatico_tickets" ADD COLUMN IF NOT EXISTS "horaTicket" VARCHAR(8);
ALTER TABLE "viatico_tickets" ADD COLUMN IF NOT EXISTS "ivaMonto" DECIMAL(10,2);
ALTER TABLE "viatico_tickets" ADD COLUMN IF NOT EXISTS "invoiceId" INTEGER;

CREATE TABLE IF NOT EXISTS "sat_lista_69b" (
  "rfc" VARCHAR(13) NOT NULL,
  "nombre" VARCHAR(300),
  "tipo" VARCHAR(20) NOT NULL,
  "actualizadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sat_lista_69b_pkey" PRIMARY KEY ("rfc")
);

CREATE TABLE IF NOT EXISTS "proveedor_contabilizacion_reglas" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "supplierRfc" VARCHAR(13) NOT NULL,
  "cuentaCodigo" VARCHAR(40) NOT NULL,
  "centroCosto" VARCHAR(80),
  "explicacion" VARCHAR(400),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "proveedor_contabilizacion_reglas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "proveedor_contabilizacion_reglas_company_rfc"
  ON "proveedor_contabilizacion_reglas"("companyId", "supplierRfc");

CREATE TABLE IF NOT EXISTS "poliza_propuestas" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "invoiceId" INTEGER NOT NULL,
  "estado" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  "confianza" VARCHAR(10) NOT NULL DEFAULT 'media',
  "explicacion" VARCHAR(500),
  "renglones" JSONB NOT NULL,
  "ligas" JSONB,
  "cuentaGastoCodigo" VARCHAR(40),
  "centroCosto" VARCHAR(80),
  "activityId" INTEGER,
  "aceptadaPorId" INTEGER,
  "aceptadaAt" TIMESTAMP(3),
  "journalEntryId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "poliza_propuestas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "poliza_propuestas_invoice_uidx" ON "poliza_propuestas"("invoiceId");
CREATE INDEX IF NOT EXISTS "poliza_propuestas_company_estado_idx" ON "poliza_propuestas"("companyId", "estado");