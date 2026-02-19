-- AlterTable
ALTER TABLE "UserDocument" ADD COLUMN     "aprobadoPorId" INTEGER,
ADD COLUMN     "revisadoEn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "aprobadoPorId" INTEGER,
ADD COLUMN     "estatus" VARCHAR(30) NOT NULL DEFAULT 'Pendiente',
ADD COLUMN     "observaciones" TEXT,
ADD COLUMN     "revisadoEn" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_aprobadoPorId_fkey" FOREIGN KEY ("aprobadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDocument" ADD CONSTRAINT "UserDocument_aprobadoPorId_fkey" FOREIGN KEY ("aprobadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
