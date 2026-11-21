-- Vehículos: captura guiada de 5 pasos, encargado, firmas, lecturas de km, avisos de retraso,
-- daños propuestos por la IA e incidencias con responsable y costo. Todo es aditivo.



ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'VEHICLE_USAGE_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'VEHICLE_DAMAGE_PROPOSED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'VEHICLE_INCIDENT_OPENED';

-- AlterTable
ALTER TABLE "VehicleControl" ADD COLUMN     "alertasKm" JSONB,
ADD COLUMN     "analisisDanosEn" TIMESTAMP(3),
ADD COLUMN     "analisisDanosEstatus" VARCHAR(20),
ADD COLUMN     "avisosRetraso" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "capturaVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "encargadoId" INTEGER,
ADD COLUMN     "firmas" JSONB,
ADD COLUMN     "kmEsperados" INTEGER,
ADD COLUMN     "lecturasKm" JSONB,
ADD COLUMN     "ultimoAvisoRetrasoEn" TIMESTAMP(3),
ADD COLUMN     "videoDevolucionUrl" VARCHAR(500),
ADD COLUMN     "videoSalidaUrl" VARCHAR(500);

-- CreateTable
CREATE TABLE "vehicle_damage_findings" (
    "id" SERIAL NOT NULL,
    "controlId" INTEGER NOT NULL,
    "vehicleAssetId" INTEGER,
    "zona" VARCHAR(40) NOT NULL,
    "descripcion" VARCHAR(500) NOT NULL,
    "severidad" VARCHAR(10) NOT NULL,
    "confianza" DECIMAL(3,2) NOT NULL,
    "fotoSalidaUrl" VARCHAR(500),
    "fotoDevolucionUrl" VARCHAR(500),
    "origen" VARCHAR(10) NOT NULL DEFAULT 'IA',
    "estatus" VARCHAR(12) NOT NULL DEFAULT 'PROPUESTO',
    "motivoDescarte" VARCHAR(30),
    "notaRevision" VARCHAR(500),
    "revisadoPorId" INTEGER,
    "revisadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "vehicle_damage_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_incidents" (
    "id" SERIAL NOT NULL,
    "vehicleAssetId" INTEGER,
    "controlId" INTEGER,
    "hallazgoId" INTEGER,
    "tipo" VARCHAR(20) NOT NULL,
    "descripcion" VARCHAR(1000) NOT NULL,
    "responsableId" INTEGER,
    "costoEstimado" DECIMAL(12,2),
    "costoReal" DECIMAL(12,2),
    "quienPaga" VARCHAR(12) NOT NULL DEFAULT 'EMPRESA',
    "cobroEstatus" VARCHAR(12),
    "cobroRevisadoPorId" INTEGER,
    "cobroRevisadoEn" TIMESTAMP(3),
    "estatus" VARCHAR(15) NOT NULL DEFAULT 'ABIERTA',
    "fotos" JSONB,
    "creadoPorId" INTEGER NOT NULL,
    "cerradoPorId" INTEGER,
    "cerradoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "vehicle_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_damage_findings_companyId_estatus_idx" ON "vehicle_damage_findings"("companyId", "estatus");

-- CreateIndex
CREATE INDEX "vehicle_damage_findings_controlId_idx" ON "vehicle_damage_findings"("controlId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_incidents_hallazgoId_key" ON "vehicle_incidents"("hallazgoId");

-- CreateIndex
CREATE INDEX "vehicle_incidents_companyId_estatus_idx" ON "vehicle_incidents"("companyId", "estatus");

-- CreateIndex
CREATE INDEX "vehicle_incidents_vehicleAssetId_idx" ON "vehicle_incidents"("vehicleAssetId");

-- CreateIndex
CREATE INDEX "vehicle_incidents_controlId_idx" ON "vehicle_incidents"("controlId");

-- CreateIndex
CREATE INDEX "VehicleControl_entregaEstatus_fechaFinAprobada_idx" ON "VehicleControl"("entregaEstatus", "fechaFinAprobada");

-- CreateIndex
CREATE INDEX "VehicleControl_actividadId_idx" ON "VehicleControl"("actividadId");

-- AddForeignKey
ALTER TABLE "VehicleControl" ADD CONSTRAINT "VehicleControl_encargadoId_fkey" FOREIGN KEY ("encargadoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_damage_findings" ADD CONSTRAINT "vehicle_damage_findings_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "VehicleControl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_damage_findings" ADD CONSTRAINT "vehicle_damage_findings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_incidents" ADD CONSTRAINT "vehicle_incidents_vehicleAssetId_fkey" FOREIGN KEY ("vehicleAssetId") REFERENCES "VehicleAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_incidents" ADD CONSTRAINT "vehicle_incidents_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "VehicleControl"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_incidents" ADD CONSTRAINT "vehicle_incidents_hallazgoId_fkey" FOREIGN KEY ("hallazgoId") REFERENCES "vehicle_damage_findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_incidents" ADD CONSTRAINT "vehicle_incidents_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_incidents" ADD CONSTRAINT "vehicle_incidents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

