ALTER TABLE "stock_movements" ADD COLUMN "projectId" INTEGER;
CREATE INDEX "stock_movements_companyId_projectId_idx" ON "stock_movements"("companyId", "projectId");
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "operational_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
