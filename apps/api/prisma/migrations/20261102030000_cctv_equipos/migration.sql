-- Catálogo de equipos del Diseñador de videovigilancia: la ficha técnica de lo que cada empresa
-- agrega. No toca `products`: si un equipo se vende, `productId` lo liga (columna suelta, como las
-- demás referencias de este módulo) y sus existencias siguen saliendo de `stock_levels`.
CREATE TABLE "cctv_equipos" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "familia" VARCHAR(24) NOT NULL,
    "tipo" VARCHAR(24) NOT NULL,
    "marca" VARCHAR(80) NOT NULL DEFAULT '',
    "modelo" VARCHAR(120) NOT NULL,
    "descripcion" VARCHAR(300) NOT NULL DEFAULT '',
    "datos" JSONB NOT NULL DEFAULT '{}',
    "medidas" JSONB,
    "caracteristicas" JSONB,
    "fuente" VARCHAR(12) NOT NULL DEFAULT 'manual',
    "verificado" BOOLEAN NOT NULL DEFAULT false,
    "productId" INTEGER,
    "creadoPorId" INTEGER NOT NULL,
    "archivadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cctv_equipos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cctv_equipos_companyId_familia_idx" ON "cctv_equipos"("companyId", "familia");
