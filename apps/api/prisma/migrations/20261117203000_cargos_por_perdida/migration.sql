DO $$ BEGIN
  CREATE TYPE "EstadoCargoPorPerdida" AS ENUM (
    'BORRADOR', 'PENDIENTE_DIRECCION', 'APROBADO', 'RECHAZADO', 'EN_COBRO', 'CERRADO'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "cargos_por_perdida" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "registradaPorId" INTEGER NOT NULL,
  "aprobadoPorId" INTEGER,
  "actividadId" INTEGER,
  "incidenciaId" INTEGER,
  "montoTotal" DECIMAL(12,2) NOT NULL,
  "hechos" TEXT NOT NULL,
  "evidenciaUrl" VARCHAR(500),
  "descargo" TEXT,
  "conformidadPdfUrl" VARCHAR(500),
  "estado" "EstadoCargoPorPerdida" NOT NULL DEFAULT 'BORRADOR',
  "planCuotasJson" JSONB,
  "motivoRechazo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cargos_por_perdida_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargos_por_perdida_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargos_por_perdida_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cargos_por_perdida_aprobadoPorId_fkey" FOREIGN KEY ("aprobadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "cargos_por_perdida_companyId_userId_idx" ON "cargos_por_perdida"("companyId", "userId");
CREATE INDEX IF NOT EXISTS "cargos_por_perdida_companyId_estado_idx" ON "cargos_por_perdida"("companyId", "estado");
