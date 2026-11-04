-- Lista personal de pendientes y foto del escritorio al salir a comer (Velocidad Core, Ola 6).
CREATE TABLE IF NOT EXISTS "pendientes_personales" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "texto" VARCHAR(200) NOT NULL,
    "hechoAt" TIMESTAMP(3),
    "activityId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pendientes_personales_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pendientes_personales_companyId_userId_hechoAt_idx" ON "pendientes_personales"("companyId", "userId", "hechoAt");

ALTER TABLE "lunch_breaks" ADD COLUMN IF NOT EXISTS "checkinFotoTipo" VARCHAR(12);
ALTER TABLE "lunch_breaks" ADD COLUMN IF NOT EXISTS "checkoutFotoTipo" VARCHAR(12);
ALTER TABLE "lunch_breaks" ADD COLUMN IF NOT EXISTS "checkinMotivoFuera" VARCHAR(300);
ALTER TABLE "lunch_breaks" ADD COLUMN IF NOT EXISTS "checkoutMotivoFuera" VARCHAR(300);
