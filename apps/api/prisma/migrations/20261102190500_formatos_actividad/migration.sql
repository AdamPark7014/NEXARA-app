-- Programa Velocidad Core, Ola 2 (02-11-2026): formatos de actividades. Solo tablas nuevas.

-- CreateTable
CREATE TABLE IF NOT EXISTS "formatos_actividad" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "descripcion" VARCHAR(300),
    "receta" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "ultimoUsoAt" TIMESTAMP(3),
    "creadoPorId" INTEGER,
    "archivadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "formatos_actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "formato_aplicaciones" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "formatoId" INTEGER NOT NULL,
    "clave" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL,
    "actividades" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "creadoPorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formato_aplicaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "formatos_actividad_companyId_archivadoAt_idx" ON "formatos_actividad"("companyId", "archivadoAt");
CREATE UNIQUE INDEX IF NOT EXISTS "formato_aplicaciones_companyId_clave_key" ON "formato_aplicaciones"("companyId", "clave");
CREATE INDEX IF NOT EXISTS "formato_aplicaciones_companyId_formatoId_idx" ON "formato_aplicaciones"("companyId", "formatoId");
