-- AlterTable
ALTER TABLE "VehicleControl" ADD COLUMN     "entregaAprobada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "entregaEstatus" VARCHAR(30) NOT NULL DEFAULT 'Pendiente',
ADD COLUMN     "entregaFotos" JSONB,
ADD COLUMN     "entregaObservaciones" TEXT,
ADD COLUMN     "entregaRevisadoEn" TIMESTAMP(3),
ADD COLUMN     "entregaRevisadoPorId" INTEGER,
ADD COLUMN     "fechaFinAprobada" TIMESTAMP(3),
ADD COLUMN     "fechaFinSolicitada" TIMESTAMP(3),
ADD COLUMN     "fechaInicioAprobada" TIMESTAMP(3),
ADD COLUMN     "fechaInicioSolicitada" TIMESTAMP(3),
ADD COLUMN     "fechaSolicitud" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "nombreVehiculo" VARCHAR(100),
ADD COLUMN     "penalizacionMonto" DECIMAL(10,2),
ADD COLUMN     "penalizacionNotas" TEXT,
ADD COLUMN     "renovacionEstatus" VARCHAR(30),
ADD COLUMN     "renovacionSolicitadaFin" TIMESTAMP(3),
ADD COLUMN     "renovacionSolicitadaInicio" TIMESTAMP(3),
ADD COLUMN     "vehicleId" INTEGER;

-- CreateTable
CREATE TABLE "VehicleAsset" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "placas" VARCHAR(20),
    "estatus" VARCHAR(30) NOT NULL DEFAULT 'Disponible',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleAsset_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "VehicleControl" ADD CONSTRAINT "VehicleControl_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "VehicleAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleControl" ADD CONSTRAINT "VehicleControl_entregaRevisadoPorId_fkey" FOREIGN KEY ("entregaRevisadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
