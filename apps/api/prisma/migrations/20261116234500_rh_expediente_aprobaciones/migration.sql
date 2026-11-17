-- CreateEnum
CREATE TYPE "TipoEmpleadoEvento" AS ENUM ('ALTA', 'CAMBIO_PUESTO', 'CAMBIO_JEFE', 'AJUSTE_SUELDO', 'BAJA', 'DOCUMENTO', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoSolicitudRh" AS ENUM ('CAMBIO_PUESTO', 'CAMBIO_JEFE', 'AJUSTE_SUELDO', 'VACACIONES', 'PERMISO');

-- CreateEnum
CREATE TYPE "EstadoSolicitudRh" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA');

-- AlterTable
ALTER TABLE "UserDocument" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "empleado_perfiles" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "area" VARCHAR(120),
    "contratoVenceAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empleado_perfiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empleado_eventos" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "tipo" "TipoEmpleadoEvento" NOT NULL,
    "detalle" JSONB,
    "actorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empleado_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_aprobacion_rh" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "tipo" "TipoSolicitudRh" NOT NULL,
    "userId" INTEGER NOT NULL,
    "solicitadoPorId" INTEGER NOT NULL,
    "aprobadorActualId" INTEGER,
    "estado" "EstadoSolicitudRh" NOT NULL DEFAULT 'PENDIENTE',
    "payload" JSONB NOT NULL,
    "leaveRequestId" INTEGER,
    "escaladoNivel" INTEGER NOT NULL DEFAULT 0,
    "escaladoAt" TIMESTAMP(3),
    "decididoPorId" INTEGER,
    "decididoAt" TIMESTAMP(3),
    "motivoRechazo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitudes_aprobacion_rh_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empleado_perfiles_userId_key" ON "empleado_perfiles"("userId");

-- CreateIndex
CREATE INDEX "empleado_perfiles_companyId_idx" ON "empleado_perfiles"("companyId");

-- CreateIndex
CREATE INDEX "empleado_eventos_companyId_userId_createdAt_idx" ON "empleado_eventos"("companyId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "solicitudes_aprobacion_rh_companyId_estado_idx" ON "solicitudes_aprobacion_rh"("companyId", "estado");

-- CreateIndex
CREATE INDEX "solicitudes_aprobacion_rh_aprobadorActualId_estado_idx" ON "solicitudes_aprobacion_rh"("aprobadorActualId", "estado");

-- CreateIndex
CREATE INDEX "solicitudes_aprobacion_rh_userId_estado_idx" ON "solicitudes_aprobacion_rh"("userId", "estado");

-- CreateIndex
CREATE INDEX "solicitudes_aprobacion_rh_leaveRequestId_idx" ON "solicitudes_aprobacion_rh"("leaveRequestId");

-- AddForeignKey
ALTER TABLE "empleado_perfiles" ADD CONSTRAINT "empleado_perfiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleado_perfiles" ADD CONSTRAINT "empleado_perfiles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleado_eventos" ADD CONSTRAINT "empleado_eventos_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleado_eventos" ADD CONSTRAINT "empleado_eventos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleado_eventos" ADD CONSTRAINT "empleado_eventos_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_aprobacion_rh" ADD CONSTRAINT "solicitudes_aprobacion_rh_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_aprobacion_rh" ADD CONSTRAINT "solicitudes_aprobacion_rh_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_aprobacion_rh" ADD CONSTRAINT "solicitudes_aprobacion_rh_solicitadoPorId_fkey" FOREIGN KEY ("solicitadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_aprobacion_rh" ADD CONSTRAINT "solicitudes_aprobacion_rh_aprobadorActualId_fkey" FOREIGN KEY ("aprobadorActualId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_aprobacion_rh" ADD CONSTRAINT "solicitudes_aprobacion_rh_decididoPorId_fkey" FOREIGN KEY ("decididoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
