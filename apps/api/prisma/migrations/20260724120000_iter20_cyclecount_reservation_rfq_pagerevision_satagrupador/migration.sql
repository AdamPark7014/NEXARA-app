-- Iter 20: Cycle Counts + Stock Reservations (Almacén), RFQ multi-proveedor (Compras),
-- versionado de Studio (PageContentRevision), base de Contabilidad Electrónica (Account.satAgrupador).

-- CreateEnum
CREATE TYPE "CycleCountStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "PurchaseRFQStatus" AS ENUM ('DRAFT', 'SENT', 'QUOTED', 'AWARDED', 'CANCELLED');

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "satAgrupador" VARCHAR(20);

-- CreateTable
CREATE TABLE "page_content_revisions" (
    "id" SERIAL NOT NULL,
    "section" VARCHAR(80) NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "publishedBy" VARCHAR(255),
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_content_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycle_counts" (
    "id" SERIAL NOT NULL,
    "countNumber" VARCHAR(30) NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "status" "CycleCountStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledFor" DATE NOT NULL,
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "companyId" INTEGER NOT NULL,
    "createdById" INTEGER,
    "closedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cycle_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycle_count_items" (
    "id" SERIAL NOT NULL,
    "cycleCountId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "expectedQty" DECIMAL(14,4) NOT NULL,
    "countedQty" DECIMAL(14,4),
    "varianceQty" DECIMAL(14,4),
    "countedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "cycle_count_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_reservations" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "status" "StockReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" VARCHAR(200) NOT NULL,
    "referenceType" VARCHAR(60),
    "referenceId" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "companyId" INTEGER NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_rfqs" (
    "id" SERIAL NOT NULL,
    "rfqNumber" VARCHAR(30) NOT NULL,
    "requisitionId" INTEGER NOT NULL,
    "status" "PurchaseRFQStatus" NOT NULL DEFAULT 'DRAFT',
    "dueDate" DATE,
    "notes" TEXT,
    "companyId" INTEGER NOT NULL,
    "createdById" INTEGER,
    "awardedPurchaseOrderId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_rfqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_rfq_lines" (
    "id" SERIAL NOT NULL,
    "rfqId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "productId" INTEGER,
    "description" VARCHAR(300) NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unitPrice" DECIMAL(14,2),
    "leadTimeDays" INTEGER,
    "notes" TEXT,
    "quotedAt" TIMESTAMP(3),

    CONSTRAINT "purchase_rfq_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_content_revisions_section_idx" ON "page_content_revisions"("section");

-- CreateIndex
CREATE UNIQUE INDEX "page_content_revisions_section_version_key" ON "page_content_revisions"("section", "version");

-- CreateIndex
CREATE UNIQUE INDEX "cycle_counts_countNumber_key" ON "cycle_counts"("countNumber");

-- CreateIndex
CREATE INDEX "cycle_counts_warehouseId_idx" ON "cycle_counts"("warehouseId");

-- CreateIndex
CREATE INDEX "cycle_counts_companyId_idx" ON "cycle_counts"("companyId");

-- CreateIndex
CREATE INDEX "cycle_counts_status_idx" ON "cycle_counts"("status");

-- CreateIndex
CREATE INDEX "cycle_count_items_cycleCountId_idx" ON "cycle_count_items"("cycleCountId");

-- CreateIndex
CREATE UNIQUE INDEX "cycle_count_items_cycleCountId_productId_key" ON "cycle_count_items"("cycleCountId", "productId");

-- CreateIndex
CREATE INDEX "stock_reservations_productId_warehouseId_idx" ON "stock_reservations"("productId", "warehouseId");

-- CreateIndex
CREATE INDEX "stock_reservations_companyId_idx" ON "stock_reservations"("companyId");

-- CreateIndex
CREATE INDEX "stock_reservations_status_idx" ON "stock_reservations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_rfqs_rfqNumber_key" ON "purchase_rfqs"("rfqNumber");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_rfqs_awardedPurchaseOrderId_key" ON "purchase_rfqs"("awardedPurchaseOrderId");

-- CreateIndex
CREATE INDEX "purchase_rfqs_requisitionId_idx" ON "purchase_rfqs"("requisitionId");

-- CreateIndex
CREATE INDEX "purchase_rfqs_companyId_idx" ON "purchase_rfqs"("companyId");

-- CreateIndex
CREATE INDEX "purchase_rfq_lines_rfqId_idx" ON "purchase_rfq_lines"("rfqId");

-- CreateIndex
CREATE INDEX "purchase_rfq_lines_supplierId_idx" ON "purchase_rfq_lines"("supplierId");

-- AddForeignKey
ALTER TABLE "cycle_counts" ADD CONSTRAINT "cycle_counts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_counts" ADD CONSTRAINT "cycle_counts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_counts" ADD CONSTRAINT "cycle_counts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_counts" ADD CONSTRAINT "cycle_counts_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_count_items" ADD CONSTRAINT "cycle_count_items_cycleCountId_fkey" FOREIGN KEY ("cycleCountId") REFERENCES "cycle_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_count_items" ADD CONSTRAINT "cycle_count_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_rfqs" ADD CONSTRAINT "purchase_rfqs_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "purchase_requisitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_rfqs" ADD CONSTRAINT "purchase_rfqs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_rfqs" ADD CONSTRAINT "purchase_rfqs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_rfqs" ADD CONSTRAINT "purchase_rfqs_awardedPurchaseOrderId_fkey" FOREIGN KEY ("awardedPurchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_rfq_lines" ADD CONSTRAINT "purchase_rfq_lines_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "purchase_rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_rfq_lines" ADD CONSTRAINT "purchase_rfq_lines_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_rfq_lines" ADD CONSTRAINT "purchase_rfq_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
