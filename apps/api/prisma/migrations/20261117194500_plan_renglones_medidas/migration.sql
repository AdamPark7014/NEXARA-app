-- Plan de mañana estructurado + medidas disciplinarias (LFT, sin multas)
ALTER TABLE "planes_diarios" ADD COLUMN IF NOT EXISTS "renglonesJson" JSONB;

DO $$ BEGIN
  CREATE TYPE "TipoMedidaDisciplinaria" AS ENUM (
    'AMONESTACION_VERBAL', 'AMONESTACION_ESCRITA', 'ACTA_ADMINISTRATIVA', 'SUSPENSION'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "EstadoMedidaDisciplinaria" AS ENUM (
    'BORRADOR', 'NOTIFICADA', 'FIRMADA', 'CERRADA', 'ANULADA'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "medidas_disciplinarias" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "registradaPorId" INTEGER NOT NULL,
  "tipo" "TipoMedidaDisciplinaria" NOT NULL,
  "estado" "EstadoMedidaDisciplinaria" NOT NULL DEFAULT 'BORRADOR',
  "hechos" TEXT NOT NULL,
  "testigos" TEXT,
  "descargo" TEXT,
  "diasSuspension" INTEGER,
  "avisoReglamento" TEXT,
  "pdfUrl" VARCHAR(500),
  "notas" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "medidas_disciplinarias_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "medidas_disciplinarias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "medidas_disciplinarias_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "medidas_disciplinarias_companyId_userId_idx" ON "medidas_disciplinarias"("companyId", "userId");
CREATE INDEX IF NOT EXISTS "medidas_disciplinarias_companyId_estado_idx" ON "medidas_disciplinarias"("companyId", "estado");

