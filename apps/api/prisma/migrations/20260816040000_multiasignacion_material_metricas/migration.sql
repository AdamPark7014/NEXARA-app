-- CreateEnum
CREATE TYPE "ActivityAssigneeRole" AS ENUM ('LEAD', 'TECNICO', 'APOYO');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "activityId" INTEGER;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "activityId" INTEGER;

-- AlterTable
ALTER TABLE "SocialPost" ADD COLUMN     "alcance" INTEGER,
ADD COLUMN     "clics" INTEGER,
ADD COLUMN     "impresiones" INTEGER,
ADD COLUMN     "interacciones" INTEGER,
ADD COLUMN     "metricasAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "activity_assignees" (
    "id" SERIAL NOT NULL,
    "activityId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "rol" "ActivityAssigneeRole" NOT NULL DEFAULT 'TECNICO',
    "horasPlan" DECIMAL(6,2),
    "horasReales" DECIMAL(6,2),
    "asignadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiradoAt" TIMESTAMP(3),
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "activity_assignees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_reassignments" (
    "id" SERIAL NOT NULL,
    "activityId" INTEGER NOT NULL,
    "deUsuarioId" INTEGER,
    "aUsuarioId" INTEGER NOT NULL,
    "movidaPorId" INTEGER NOT NULL,
    "motivo" VARCHAR(400),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "activity_reassignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_assignees_userId_retiradoAt_idx" ON "activity_assignees"("userId", "retiradoAt");

-- CreateIndex
CREATE INDEX "activity_assignees_companyId_idx" ON "activity_assignees"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "activity_assignees_activityId_userId_key" ON "activity_assignees"("activityId", "userId");

-- CreateIndex
CREATE INDEX "activity_reassignments_activityId_createdAt_idx" ON "activity_reassignments"("activityId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_reassignments_companyId_idx" ON "activity_reassignments"("companyId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_assignees" ADD CONSTRAINT "activity_assignees_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_assignees" ADD CONSTRAINT "activity_assignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_assignees" ADD CONSTRAINT "activity_assignees_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_reassignments" ADD CONSTRAINT "activity_reassignments_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_reassignments" ADD CONSTRAINT "activity_reassignments_deUsuarioId_fkey" FOREIGN KEY ("deUsuarioId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_reassignments" ADD CONSTRAINT "activity_reassignments_aUsuarioId_fkey" FOREIGN KEY ("aUsuarioId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_reassignments" ADD CONSTRAINT "activity_reassignments_movidaPorId_fkey" FOREIGN KEY ("movidaPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_reassignments" ADD CONSTRAINT "activity_reassignments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

