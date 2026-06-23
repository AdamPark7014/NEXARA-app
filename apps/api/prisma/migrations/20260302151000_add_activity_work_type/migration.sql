-- CreateEnum
CREATE TYPE "ActivityWorkType" AS ENUM ('ISSUE', 'PREVENTIVE_INVENTORY');

-- AlterTable
ALTER TABLE "Activity"
ADD COLUMN "workType" "ActivityWorkType" NOT NULL DEFAULT 'ISSUE';
