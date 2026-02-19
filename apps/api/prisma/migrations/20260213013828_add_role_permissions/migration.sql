-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "accesoAsistencia" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoConsole" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoConsoleAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoEvidencias" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoGps" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoVehiculos" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "accesoViaticos" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "nivelAutoridad" SET DEFAULT 0;
