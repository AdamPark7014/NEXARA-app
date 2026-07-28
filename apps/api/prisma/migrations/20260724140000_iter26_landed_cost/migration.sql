-- Iter 26: Landed cost — flete/seguro/aranceles/otros prorrateados sobre el costo unitario recibido.

-- AlterTable
ALTER TABLE "goods_receipts" ADD COLUMN     "freightCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "insuranceCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "customsCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "otherLandedCost" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "goods_receipt_items" ADD COLUMN     "landedCostAllocated" DECIMAL(14,4) NOT NULL DEFAULT 0;
