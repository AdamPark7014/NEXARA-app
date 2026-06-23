/*
  Warnings:

  - You are about to drop the `Viatico` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Viatico" DROP CONSTRAINT "Viatico_actividadId_fkey";

-- DropForeignKey
ALTER TABLE "Viatico" DROP CONSTRAINT "Viatico_usuarioId_fkey";

-- DropTable
DROP TABLE "Viatico";

-- CreateTable
CREATE TABLE "viaticos" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "actividadId" INTEGER,
    "projectId" INTEGER,
    "montoSolicitado" DECIMAL(10,2) NOT NULL,
    "motivo" VARCHAR(255),
    "ticketEvidenciaUrl" TEXT,
    "estatus" VARCHAR(30) NOT NULL DEFAULT 'Pendiente',
    "fechaSolicitud" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "viaticos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "viaticos" ADD CONSTRAINT "viaticos_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viaticos" ADD CONSTRAINT "viaticos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viaticos" ADD CONSTRAINT "viaticos_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "sales_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
