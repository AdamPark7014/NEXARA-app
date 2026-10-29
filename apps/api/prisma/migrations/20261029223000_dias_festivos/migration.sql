-- Días festivos y cómo se trabajan (29-10-2026). Los de ley no necesitan fila: la fila existe
-- cuando dirección cambia uno de ellos o para los días que da la empresa.
CREATE TABLE "dias_festivos" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "origen" VARCHAR(10) NOT NULL,
    "modo" VARCHAR(20) NOT NULL DEFAULT 'NO_SE_LABORA',
    "horaEntrada" VARCHAR(5),
    "horaSalida" VARCHAR(5),
    "personas" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "pagoDoble" BOOLEAN NOT NULL DEFAULT true,
    "avisar" BOOLEAN NOT NULL DEFAULT true,
    "nota" VARCHAR(300),
    "actualizadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dias_festivos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dias_festivos_companyId_fecha_key" ON "dias_festivos"("companyId", "fecha");

ALTER TABLE "dias_festivos" ADD CONSTRAINT "dias_festivos_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
