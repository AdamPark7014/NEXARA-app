-- AlterTable
ALTER TABLE "cotizacion_items" ADD COLUMN     "batchReference" VARCHAR(120),
ADD COLUMN     "brand" VARCHAR(120),
ADD COLUMN     "category" VARCHAR(120),
ADD COLUMN     "countryOrigin" VARCHAR(80),
ADD COLUMN     "deliveryTime" VARCHAR(120),
ADD COLUMN     "ieps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "laborHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "laborRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "model" VARCHAR(120),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "partNumber" VARCHAR(120),
ADD COLUMN     "retention" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scope" TEXT,
ADD COLUMN     "sku" VARCHAR(120),
ADD COLUMN     "unit" VARCHAR(40),
ADD COLUMN     "warrantyMonths" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "cotizaciones" ADD COLUMN     "iepsTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "retentionTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;
