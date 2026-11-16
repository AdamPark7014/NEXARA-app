-- CreateEnum
CREATE TYPE "EstadoPlanDiario" AS ENUM ('ENVIADO', 'PROGRAMADO', 'DEVUELTO');

-- CreateTable
CREATE TABLE "planes_diarios" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "autorId" INTEGER NOT NULL,
    "supervisorId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "texto" TEXT NOT NULL,
    "estado" "EstadoPlanDiario" NOT NULL DEFAULT 'ENVIADO',
    "notaSupervisor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planes_diarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cierres_diarios" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "supervisorId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "comentario" TEXT,
    "resumenJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cierres_diarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "planes_diarios_companyId_fecha_idx" ON "planes_diarios"("companyId", "fecha");

-- CreateIndex
CREATE INDEX "planes_diarios_supervisorId_fecha_idx" ON "planes_diarios"("supervisorId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "planes_diarios_autorId_fecha_key" ON "planes_diarios"("autorId", "fecha");

-- CreateIndex
CREATE INDEX "cierres_diarios_companyId_fecha_idx" ON "cierres_diarios"("companyId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "cierres_diarios_supervisorId_fecha_key" ON "cierres_diarios"("supervisorId", "fecha");

-- AddForeignKey
ALTER TABLE "planes_diarios" ADD CONSTRAINT "planes_diarios_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_diarios" ADD CONSTRAINT "planes_diarios_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_diarios" ADD CONSTRAINT "planes_diarios_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_diarios" ADD CONSTRAINT "cierres_diarios_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_diarios" ADD CONSTRAINT "cierres_diarios_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
