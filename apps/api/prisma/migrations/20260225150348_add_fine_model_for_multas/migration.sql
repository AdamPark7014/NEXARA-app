-- CreateTable
CREATE TABLE "fines" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tipo" VARCHAR(50) NOT NULL,
    "razon" VARCHAR(100) NOT NULL,
    "descripcion" TEXT,
    "monto" DECIMAL(10,2) NOT NULL,
    "referenciaId" INTEGER,
    "estatusPago" VARCHAR(30) NOT NULL DEFAULT 'Pendiente',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaPago" TIMESTAMP(3),
    "notas" TEXT,

    CONSTRAINT "fines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fines_usuarioId_tipo_estatusPago_idx" ON "fines"("usuarioId", "tipo", "estatusPago");

-- AddForeignKey
ALTER TABLE "fines" ADD CONSTRAINT "fines_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
