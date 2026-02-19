-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "accesoActividades" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoContabilidad" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoGestionTienda" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoGestionUsuarios" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoGestionWeb" BOOLEAN NOT NULL DEFAULT false;
