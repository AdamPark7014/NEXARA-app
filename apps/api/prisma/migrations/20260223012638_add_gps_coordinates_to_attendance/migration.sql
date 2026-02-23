-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ATTENDANCE_UPDATE';

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "entryLatitude" DOUBLE PRECISION,
ADD COLUMN     "entryLongitude" DOUBLE PRECISION,
ADD COLUMN     "exitLatitude" DOUBLE PRECISION,
ADD COLUMN     "exitLongitude" DOUBLE PRECISION;
