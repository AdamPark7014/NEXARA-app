-- CreateTable
CREATE TABLE "sales_project_order_lines" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "productId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "category" VARCHAR(120),
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "scope" TEXT,
    "brand" VARCHAR(120),
    "model" VARCHAR(120),
    "sku" VARCHAR(120),
    "partNumber" VARCHAR(120),
    "batchReference" VARCHAR(120),
    "unit" VARCHAR(40),
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "ieps" INTEGER NOT NULL DEFAULT 0,
    "retention" INTEGER NOT NULL DEFAULT 0,
    "laborHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "laborRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "warrantyMonths" INTEGER NOT NULL DEFAULT 0,
    "deliveryTime" VARCHAR(120),
    "countryOrigin" VARCHAR(80),
    "notes" TEXT,
    "lineTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_project_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_project_order_lines_orderId_idx" ON "sales_project_order_lines"("orderId");

-- AddForeignKey
ALTER TABLE "sales_project_order_lines" ADD CONSTRAINT "sales_project_order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "sales_project_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_project_order_lines" ADD CONSTRAINT "sales_project_order_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
