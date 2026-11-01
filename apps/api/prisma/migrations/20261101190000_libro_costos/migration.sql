-- Libro de costos (01-11-2026): solo tablas nuevas; no toca ninguna existente.

-- CreateTable
CREATE TABLE "costo_parametros" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "ps" DECIMAL(6,4) NOT NULL DEFAULT 0.25,
    "psValidado" BOOLEAN NOT NULL DEFAULT false,
    "otrosDias" INTEGER NOT NULL DEFAULT 3,
    "aguinaldoDias" INTEGER NOT NULL DEFAULT 15,
    "primaVacacional" DECIMAL(5,4) NOT NULL DEFAULT 0.25,
    "kh" DECIMAL(5,4) NOT NULL DEFAULT 0.03,
    "ks" DECIMAL(5,4) NOT NULL DEFAULT 0.01,
    "indirectoPct" DECIMAL(6,4),
    "tasaInteres" DECIMAL(6,4),
    "notas" VARCHAR(500),
    "actualizadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "costo_parametros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costo_categorias" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "clave" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "tipo" VARCHAR(10) NOT NULL DEFAULT 'DIRECTO',
    "sueldoSemanalRef" DECIMAL(10,2),
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "costo_categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costo_personas" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "categoriaId" INTEGER,
    "psPropio" DECIMAL(6,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "costo_personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costo_fichas_equipo" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "tipo" VARCHAR(12) NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "vehicleId" INTEGER,
    "toolId" INTEGER,
    "unidad" VARCHAR(6) NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "valorLlantas" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rescatePct" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "vidaUnidades" DECIMAL(12,2) NOT NULL,
    "unidadesAnio" DECIMAL(12,2) NOT NULL,
    "tasaInteres" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "primaSeguro" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "ko" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "rendimiento" DECIMAL(8,3),
    "precioCombustible" DECIMAL(8,3),
    "costoAceite" DECIMAL(10,2),
    "aceiteCadaUnidades" DECIMAL(12,2),
    "vidaLlantasUnidades" DECIMAL(12,2),
    "otrosAnuales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notas" VARCHAR(300),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "actualizadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "costo_fichas_equipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costo_movimientos" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "origen" VARCHAR(40) NOT NULL,
    "rubro" VARCHAR(14) NOT NULL,
    "fecha" DATE NOT NULL,
    "activityId" INTEGER NOT NULL,
    "userId" INTEGER,
    "cantidad" DECIMAL(14,4) NOT NULL,
    "unidad" VARCHAR(12) NOT NULL,
    "costoUnitario" DECIMAL(12,4) NOT NULL,
    "importe" DECIMAL(14,2) NOT NULL,
    "nota" VARCHAR(200),
    "estado" VARCHAR(12) NOT NULL DEFAULT 'PROVISIONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "costo_movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costo_actividad_ligas" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "activityId" INTEGER NOT NULL,
    "tipo" VARCHAR(12),
    "proyectoId" INTEGER,
    "cotizacionId" INTEGER,
    "decididoPorId" INTEGER,
    "decididoAt" TIMESTAMP(3),
    "sugerenciaTipo" VARCHAR(12),
    "sugerenciaId" INTEGER,
    "sugerenciaNombre" VARCHAR(200),
    "sugerenciaMotivo" VARCHAR(160),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "costo_actividad_ligas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "costo_parametros_companyId_idx" ON "costo_parametros"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "costo_parametros_companyId_anio_key" ON "costo_parametros"("companyId", "anio");

-- CreateIndex
CREATE INDEX "costo_categorias_companyId_idx" ON "costo_categorias"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "costo_categorias_companyId_clave_key" ON "costo_categorias"("companyId", "clave");

-- CreateIndex
CREATE INDEX "costo_personas_companyId_idx" ON "costo_personas"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "costo_personas_companyId_userId_key" ON "costo_personas"("companyId", "userId");

-- CreateIndex
CREATE INDEX "costo_fichas_equipo_companyId_idx" ON "costo_fichas_equipo"("companyId");

-- CreateIndex
CREATE INDEX "costo_fichas_equipo_vehicleId_idx" ON "costo_fichas_equipo"("vehicleId");

-- CreateIndex
CREATE INDEX "costo_fichas_equipo_toolId_idx" ON "costo_fichas_equipo"("toolId");

-- CreateIndex
CREATE INDEX "costo_movimientos_companyId_activityId_idx" ON "costo_movimientos"("companyId", "activityId");

-- CreateIndex
CREATE INDEX "costo_movimientos_companyId_fecha_idx" ON "costo_movimientos"("companyId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "costo_movimientos_companyId_origen_key" ON "costo_movimientos"("companyId", "origen");

-- CreateIndex
CREATE INDEX "costo_actividad_ligas_companyId_proyectoId_idx" ON "costo_actividad_ligas"("companyId", "proyectoId");

-- CreateIndex
CREATE INDEX "costo_actividad_ligas_companyId_cotizacionId_idx" ON "costo_actividad_ligas"("companyId", "cotizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "costo_actividad_ligas_companyId_activityId_key" ON "costo_actividad_ligas"("companyId", "activityId");

