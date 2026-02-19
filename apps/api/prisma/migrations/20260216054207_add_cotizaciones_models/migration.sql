-- CreateEnum
CREATE TYPE "CotizacionStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED');

-- CreateTable
CREATE TABLE "cotizaciones" (
    "id" SERIAL NOT NULL,
    "quoteNumber" VARCHAR(40) NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "status" "CotizacionStatus" NOT NULL DEFAULT 'DRAFT',
    "clientName" VARCHAR(180),
    "clientCompany" VARCHAR(200),
    "clientEmail" VARCHAR(200),
    "clientPhone" VARCHAR(60),
    "clientAddress" TEXT,
    "projectName" VARCHAR(200),
    "scope" TEXT,
    "paymentTerms" VARCHAR(200),
    "deliveryTime" VARCHAR(120),
    "preparedBy" VARCHAR(120),
    "preparedRole" VARCHAR(120),
    "currency" VARCHAR(10) NOT NULL DEFAULT 'MXN',
    "depositPercent" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "publicToken" VARCHAR(80),
    "sentToEmail" VARCHAR(200),
    "sentAt" TIMESTAMP(3),
    "signedByName" VARCHAR(180),
    "signedByEmail" VARCHAR(200),
    "signedAt" TIMESTAMP(3),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion_items" (
    "id" SERIAL NOT NULL,
    "cotizacionId" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizacion_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cotizaciones_quoteNumber_key" ON "cotizaciones"("quoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "cotizaciones_publicToken_key" ON "cotizaciones"("publicToken");

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_items" ADD CONSTRAINT "cotizacion_items_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
