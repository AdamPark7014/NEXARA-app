-- Fase 3 del libro de costos: ficha de vehículos, gasolina y servicios. Solo agrega: no toca lo que existe.
ALTER TABLE "costo_movimientos" ADD COLUMN "detalle" JSONB;

CREATE TABLE "vehiculo_especificaciones" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "marca" VARCHAR(60),
    "modelo" VARCHAR(80),
    "anio" INTEGER,
    "version" VARCHAR(80),
    "numeroSerie" VARCHAR(30),
    "motor" VARCHAR(80),
    "potenciaHp" INTEGER,
    "transmision" VARCHAR(40),
    "combustible" VARCHAR(40),
    "tanqueLitros" DECIMAL(6,1),
    "aceiteTipo" VARCHAR(40),
    "aceiteLitros" DECIMAL(5,1),
    "llantaMedida" VARCHAR(30),
    "llantaPsi" INTEGER,
    "cargaKg" INTEGER,
    "rendimientoOficial" DECIMAL(6,2),
    "fechaCompra" DATE,
    "odometroCompra" INTEGER,
    "odometroAlta" INTEGER,
    "fuentes" JSONB,
    "actualizadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vehiculo_especificaciones_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vehiculo_especificaciones_vehicleId_key" ON "vehiculo_especificaciones"("vehicleId");
CREATE INDEX "vehiculo_especificaciones_companyId_idx" ON "vehiculo_especificaciones"("companyId");

CREATE TABLE "vehiculo_documentos" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "tipo" VARCHAR(14) NOT NULL,
    "nombre" VARCHAR(160) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "paginas" INTEGER,
    "venceEl" DATE,
    "creadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vehiculo_documentos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vehiculo_documentos_companyId_vehicleId_idx" ON "vehiculo_documentos"("companyId", "vehicleId");

CREATE TABLE "vehiculo_servicio_planes" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "concepto" VARCHAR(120) NOT NULL,
    "cadaKm" INTEGER,
    "cadaMeses" INTEGER,
    "costoEstimado" DECIMAL(10,2),
    "paginaManual" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vehiculo_servicio_planes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vehiculo_servicio_planes_companyId_vehicleId_idx" ON "vehiculo_servicio_planes"("companyId", "vehicleId");

CREATE TABLE "vehiculo_servicios" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "odometro" INTEGER,
    "concepto" VARCHAR(200) NOT NULL,
    "costo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "proveedor" VARCHAR(120),
    "comprobanteUrl" VARCHAR(500),
    "planIds" INTEGER[],
    "notas" VARCHAR(300),
    "registradoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vehiculo_servicios_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vehiculo_servicios_companyId_vehicleId_idx" ON "vehiculo_servicios"("companyId", "vehicleId");

CREATE TABLE "vehiculo_cargas" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "odometro" INTEGER NOT NULL,
    "litros" DECIMAL(7,2) NOT NULL,
    "importe" DECIMAL(10,2) NOT NULL,
    "tanqueLleno" BOOLEAN NOT NULL DEFAULT true,
    "ticketUrl" VARCHAR(500),
    "tableroUrl" VARCHAR(500),
    "registradoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vehiculo_cargas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vehiculo_cargas_companyId_vehicleId_fecha_idx" ON "vehiculo_cargas"("companyId", "vehicleId", "fecha");
