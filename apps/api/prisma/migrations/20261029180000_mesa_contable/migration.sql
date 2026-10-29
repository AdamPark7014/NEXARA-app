-- Mesa contable (29-10-2026): la factura sabe de qué cotización viene y si es un anticipo; la
-- contadora puede descartar lo que no se factura, y cada pago o gasto se liga a su CFDI y a su
-- movimiento de banco.

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "cotizacionId" INTEGER,
ADD COLUMN     "esAnticipo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "por_facturar_descartes" (
    "id" SERIAL NOT NULL,
    "origen" VARCHAR(20) NOT NULL,
    "origenId" INTEGER NOT NULL,
    "motivo" VARCHAR(300) NOT NULL,
    "createdById" INTEGER,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "por_facturar_descartes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_vinculos" (
    "id" SERIAL NOT NULL,
    "origen" VARCHAR(20) NOT NULL,
    "origenId" INTEGER NOT NULL,
    "invoiceId" INTEGER,
    "bankTransactionId" INTEGER,
    "importe" DECIMAL(14,2),
    "createdById" INTEGER,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_vinculos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "por_facturar_descartes_companyId_idx" ON "por_facturar_descartes"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "por_facturar_descartes_companyId_origen_origenId_key" ON "por_facturar_descartes"("companyId", "origen", "origenId");

-- CreateIndex
CREATE INDEX "movimiento_vinculos_companyId_origen_origenId_idx" ON "movimiento_vinculos"("companyId", "origen", "origenId");

-- CreateIndex
CREATE INDEX "movimiento_vinculos_invoiceId_idx" ON "movimiento_vinculos"("invoiceId");

-- CreateIndex
CREATE INDEX "movimiento_vinculos_bankTransactionId_idx" ON "movimiento_vinculos"("bankTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "movimiento_vinculos_companyId_origen_origenId_invoiceId_key" ON "movimiento_vinculos"("companyId", "origen", "origenId", "invoiceId");

-- CreateIndex
CREATE INDEX "invoices_activityId_idx" ON "invoices"("activityId");

-- CreateIndex
CREATE INDEX "invoices_cotizacionId_idx" ON "invoices"("cotizacionId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_vinculos" ADD CONSTRAINT "movimiento_vinculos_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_vinculos" ADD CONSTRAINT "movimiento_vinculos_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "bank_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
