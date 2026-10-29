-- Timbrado con Facturama (29-10-2026): el PAC identifica cada CFDI con su propio Id (no con el UUID)
-- para cancelarlo y para bajar su PDF. Se guarda en la factura y en el pago con complemento.

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "pacDocumentId" VARCHAR(80);

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "pacDocumentId" VARCHAR(80);
