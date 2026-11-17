-- CreateTable
CREATE TABLE "viatico_tickets" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "viaticoId" INTEGER NOT NULL,
    "actividadId" INTEGER,
    "usuarioId" INTEGER NOT NULL,
    "tipo" VARCHAR(20) NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "fechaHora" TIMESTAMP(3) NOT NULL,
    "estacionComercio" VARCHAR(160),
    "rfcEmisor" VARCHAR(13),
    "puedeFacturar" BOOLEAN NOT NULL DEFAULT true,
    "fechaLimiteFacturacion" DATE,
    "fotoUrl" VARCHAR(500) NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "motivoRechazo" VARCHAR(400),
    "revisadoPorId" INTEGER,
    "revisadoAt" TIMESTAMP(3),
    "facturadoPorId" INTEGER,
    "facturadoAt" TIMESTAMP(3),
    "facturaXmlUrl" VARCHAR(500),
    "facturaPdfUrl" VARCHAR(500),
    "notas" VARCHAR(400),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "viatico_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "viatico_tickets_companyId_estado_fechaLimiteFacturacion_idx" ON "viatico_tickets"("companyId", "estado", "fechaLimiteFacturacion");

-- CreateIndex
CREATE INDEX "viatico_tickets_viaticoId_idx" ON "viatico_tickets"("viaticoId");

-- CreateIndex
CREATE INDEX "viatico_tickets_usuarioId_estado_idx" ON "viatico_tickets"("usuarioId", "estado");

-- AddForeignKey
ALTER TABLE "viatico_tickets" ADD CONSTRAINT "viatico_tickets_viaticoId_fkey" FOREIGN KEY ("viaticoId") REFERENCES "viaticos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

