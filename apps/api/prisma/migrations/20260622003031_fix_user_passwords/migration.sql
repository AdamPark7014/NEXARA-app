-- DropForeignKey
ALTER TABLE "sales_targets" DROP CONSTRAINT "sales_targets_ownerId_fkey";

-- DropIndex
DROP INDEX "User_estadoRRHH_idx";

-- DropIndex
DROP INDEX "User_isActive_idx";

-- DropIndex
DROP INDEX "User_managerId_idx";

-- DropIndex
DROP INDEX "User_roleKey_idx";

-- AlterTable
ALTER TABLE "CaseStudy" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "InternalComunicado" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "itemType" "CatalogItemType" NOT NULL DEFAULT 'PRODUCT';

-- AlterTable
ALTER TABLE "SocialPost" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "estadoRRHH" DROP NOT NULL,
ALTER COLUMN "fechaIngreso" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "feature_flags" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "hero_slides" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "page_content" (
    "id" SERIAL NOT NULL,
    "section" VARCHAR(80) NOT NULL,
    "content" JSONB NOT NULL,
    "updatedBy" VARCHAR(255),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_content_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "page_content_section_key" ON "page_content"("section");

-- AddForeignKey
ALTER TABLE "cotizacion_items" ADD CONSTRAINT "cotizacion_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_targets" ADD CONSTRAINT "sales_targets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
