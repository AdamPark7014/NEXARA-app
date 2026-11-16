-- Bitácora de incidencias de personal (alimenta prenómina).
CREATE TYPE "TipoIncidenciaPersonal" AS ENUM (
  'FALTA_JUSTIFICADA','FALTA_INJUSTIFICADA','RETARDO','PERMISO_CON_GOCE','PERMISO_SIN_GOCE',
  'INCAPACIDAD','VACACIONES','HORAS_EXTRA','BONO','DESCUENTO','PRESTAMO','OTRO'
);
CREATE TYPE "EstadoIncidenciaPersonal" AS ENUM ('REGISTRADA', 'APLICADA', 'CANCELADA');

CREATE TABLE "incidencias_personal" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "fecha" DATE NOT NULL,
  "tipo" "TipoIncidenciaPersonal" NOT NULL,
  "concepto" VARCHAR(200) NOT NULL,
  "cantidad" DECIMAL(10,2),
  "monto" DECIMAL(12,2),
  "autorizadoPorId" INTEGER,
  "justificanteUrl" VARCHAR(500),
  "estado" "EstadoIncidenciaPersonal" NOT NULL DEFAULT 'REGISTRADA',
  "semanaNomina" VARCHAR(20),
  "nominaDescuentoId" INTEGER,
  "creadoPorId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "incidencias_personal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "incidencias_personal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "incidencias_personal_autorizadoPorId_fkey" FOREIGN KEY ("autorizadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "incidencias_personal_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "incidencias_personal_nominaDescuentoId_fkey" FOREIGN KEY ("nominaDescuentoId") REFERENCES "nomina_descuentos"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "incidencias_personal_companyId_semanaNomina_idx" ON "incidencias_personal"("companyId", "semanaNomina");
CREATE INDEX "incidencias_personal_companyId_userId_idx" ON "incidencias_personal"("companyId", "userId");
CREATE INDEX "incidencias_personal_companyId_tipo_idx" ON "incidencias_personal"("companyId", "tipo");
CREATE INDEX "incidencias_personal_nominaDescuentoId_idx" ON "incidencias_personal"("nominaDescuentoId");
