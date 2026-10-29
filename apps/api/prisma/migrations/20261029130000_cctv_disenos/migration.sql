-- Diseñador de videovigilancia (docs/DISENADOR-CCTV.md §9): los diseños que arman los
-- encargados de área en Core (/erp/videovigilancia).
--
-- "plano" es el Plano de apps/web/lib/cctv/plano.ts (versión 1); "version" es la
-- concurrencia optimista: cada guardado exige la versión que se abrió y la sube en 1.
-- Las referencias (empresa, cliente, cotización y personas) son columnas sueltas, como en
-- "cotizacion_plantillas": el aislamiento por empresa lo pone el middleware de tenant.
--
-- Aditiva: tabla nueva, ningún ALTER a tablas existentes, ningún DROP ni RENAME y
-- ningún UPDATE/INSERT/DELETE. Idempotente (IF NOT EXISTS en todo).
--
-- Columnas, tipos y nombre del índice son los que genera Prisma para el modelo CctvDiseno.

-- CreateTable
CREATE TABLE IF NOT EXISTS "cctv_disenos" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "nombre" VARCHAR(160) NOT NULL,
    "clienteId" INTEGER,
    "cotizacionId" INTEGER,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'borrador',
    "plano" JSONB NOT NULL,
    "grabacion" JSONB,
    "resumen" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "creadoPorId" INTEGER NOT NULL,
    "actualizadoPorId" INTEGER,
    "archivadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cctv_disenos_pkey" PRIMARY KEY ("id")
);

-- Lista de la empresa, lo más reciente primero.
-- CreateIndex
CREATE INDEX IF NOT EXISTS "cctv_disenos_companyId_updatedAt_idx" ON "cctv_disenos"("companyId", "updatedAt");
