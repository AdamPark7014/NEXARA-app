-- Cuánto tomó de verdad, dicho por quien la ejecutó (Velocidad Core, Ola 4).
CREATE TABLE IF NOT EXISTS "actividad_tiempo_dicho" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "activityId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "minutos" INTEGER NOT NULL,
    "relojMin" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actividad_tiempo_dicho_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "actividad_tiempo_dicho_activityId_key" ON "actividad_tiempo_dicho"("activityId");
CREATE INDEX IF NOT EXISTS "actividad_tiempo_dicho_companyId_idx" ON "actividad_tiempo_dicho"("companyId");
