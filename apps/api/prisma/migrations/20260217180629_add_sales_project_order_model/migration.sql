-- AlterTable
ALTER TABLE "sales_projects" ADD COLUMN     "closureOrderId" INTEGER;

-- CreateTable
CREATE TABLE "sales_project_orders" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "orderId" VARCHAR(40) NOT NULL,
    "quoteId" INTEGER,
    "orderPdfUrl" VARCHAR(500),
    "status" VARCHAR(40) NOT NULL DEFAULT 'OPEN',
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_project_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_project_orders_projectId_key" ON "sales_project_orders"("projectId");

-- AddForeignKey
ALTER TABLE "sales_project_orders" ADD CONSTRAINT "sales_project_orders_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "sales_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_project_orders" ADD CONSTRAINT "sales_project_orders_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "sales_opportunity_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_project_orders" ADD CONSTRAINT "sales_project_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
