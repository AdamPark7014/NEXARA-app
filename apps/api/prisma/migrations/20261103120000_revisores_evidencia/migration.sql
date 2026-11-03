-- Quien revisa la evidencia de una persona en lugar de su jefe (Velocidad Core, Ola 5).
CREATE TABLE IF NOT EXISTS "revisores_evidencia" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "revisorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revisores_evidencia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "revisores_evidencia_userId_key" ON "revisores_evidencia"("userId");
CREATE INDEX IF NOT EXISTS "revisores_evidencia_companyId_idx" ON "revisores_evidencia"("companyId");
