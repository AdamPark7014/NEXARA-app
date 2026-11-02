-- Programa Velocidad Core, Ola 3 (02-11-2026): bitácora de salidas deshechas. Solo una tabla nueva.

-- CreateTable
CREATE TABLE IF NOT EXISTS "salidas_deshechas" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "attendanceId" INTEGER NOT NULL,
    "salidaAt" TIMESTAMP(3) NOT NULL,
    "workDate" DATE NOT NULL,
    "datos" JSONB NOT NULL,
    "noCumplidas" JSONB NOT NULL DEFAULT '[]',
    "relojesReabiertos" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "motivo" TEXT,
    "porId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salidas_deshechas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "salidas_deshechas_companyId_userId_workDate_idx" ON "salidas_deshechas"("companyId", "userId", "workDate");
