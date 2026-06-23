-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "aprobadoPorId" INTEGER,
ADD COLUMN     "calificacionEficiencia" VARCHAR(20),
ADD COLUMN     "comentarios" TEXT,
ADD COLUMN     "estatus" VARCHAR(50) NOT NULL DEFAULT 'Pendiente',
ADD COLUMN     "observacionesRevision" TEXT,
ADD COLUMN     "revisadoEn" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_aprobadoPorId_fkey" FOREIGN KEY ("aprobadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
