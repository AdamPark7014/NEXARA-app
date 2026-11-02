-- Programa Velocidad Core (01-11-2026): cronómetro de procesos. Tabla nueva; no toca ninguna existente.

-- CreateTable
CREATE TABLE "proceso_tiempos" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "proceso" VARCHAR(20) NOT NULL,
    "duracionMs" INTEGER NOT NULL,
    "clics" INTEGER,
    "entidadId" INTEGER,
    "detalle" VARCHAR(60),
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proceso_tiempos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proceso_tiempos_companyId_proceso_at_idx" ON "proceso_tiempos"("companyId", "proceso", "at");
