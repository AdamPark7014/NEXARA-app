-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "fechaInicio" TIMESTAMP(3),
ADD COLUMN     "fechaMaxima" TIMESTAMP(3),
ADD COLUMN     "indicaciones" TEXT,
ADD COLUMN     "tiempoEstimadoMin" INTEGER,
ADD COLUMN     "tiempoMaximoMin" INTEGER;
