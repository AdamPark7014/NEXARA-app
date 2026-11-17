-- Contadora E2-E4: SatCfdi, plantillas poliza, reglas conciliacion, bloqueo periodo

ALTER TABLE "fiscal_periods" ADD COLUMN IF NOT EXISTS "bloqueoModo" VARCHAR(20) NOT NULL DEFAULT 'abierto';

CREATE TABLE IF NOT EXISTS "sat_cfdis" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "uuid" VARCHAR(80) NOT NULL,
  "rfcEmisor" VARCHAR(13) NOT NULL,
  "nombreEmisor" VARCHAR(300),
  "rfcReceptor" VARCHAR(13) NOT NULL,
  "nombreReceptor" VARCHAR(300),
  "total" DECIMAL(14,2) NOT NULL,
  "subtotal" DECIMAL(14,2),
  "ivaTrasladado" DECIMAL(14,2),
  "ivaRetenido" DECIMAL(14,2),
  "isrRetenido" DECIMAL(14,2),
  "tipo" VARCHAR(1) NOT NULL,
  "metodoPago" VARCHAR(3),
  "formaPago" VARCHAR(5),
  "usoCfdi" VARCHAR(5),
  "sentido" VARCHAR(10) NOT NULL,
  "estatusSat" VARCHAR(20) NOT NULL DEFAULT 'vigente',
  "fecha" TIMESTAMP(3) NOT NULL,
  "xml" TEXT NOT NULL,
  "serie" VARCHAR(25),
  "folio" VARCHAR(40),
  "moneda" VARCHAR(10) DEFAULT 'MXN',
  "invoiceId" INTEGER,
  "journalEntryId" INTEGER,
  "supplierId" INTEGER,
  "lista69B" VARCHAR(20),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sat_cfdis_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "sat_cfdis_uuid_key" ON "sat_cfdis"("uuid");
CREATE INDEX IF NOT EXISTS "sat_cfdis_company_sentido_idx" ON "sat_cfdis"("companyId", "sentido");
CREATE INDEX IF NOT EXISTS "sat_cfdis_company_fecha_idx" ON "sat_cfdis"("companyId", "fecha");
CREATE INDEX IF NOT EXISTS "sat_cfdis_estatus_idx" ON "sat_cfdis"("estatusSat");

ALTER TABLE "poliza_propuestas" ADD COLUMN IF NOT EXISTS "satCfdiId" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "poliza_propuestas_sat_cfdi_uidx" ON "poliza_propuestas"("satCfdiId");

CREATE TABLE IF NOT EXISTS "poliza_plantillas" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "tipo" VARCHAR(1) NOT NULL,
  "nombre" VARCHAR(120) NOT NULL,
  "renglones" JSONB NOT NULL,
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "poliza_plantillas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "poliza_plantillas_company_tipo_uidx" ON "poliza_plantillas"("companyId", "tipo");

CREATE TABLE IF NOT EXISTS "conciliacion_reglas" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "contiene" VARCHAR(200) NOT NULL,
  "cuentaCodigo" VARCHAR(40) NOT NULL,
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conciliacion_reglas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "conciliacion_reglas_company_idx" ON "conciliacion_reglas"("companyId");

ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "cfdiUuid" VARCHAR(80);
CREATE INDEX IF NOT EXISTS "journal_entries_cfdi_uuid_idx" ON "journal_entries"("cfdiUuid");
