-- Cierra los tres últimos huecos del análisis por áreas del organigrama:
--
--   Administración · compras a mayorista con crédito y precio por volumen
--   Ingeniería     · incidencias y recomendaciones tipificadas
--   Todas las áreas· el ritmo operativo (reuniones, acuerdos, lecciones)
--
-- Enteramente ADITIVA: 9 tipos nuevos, 6 tablas nuevas y 6 columnas nuevas en
-- `suppliers`. Ninguna columna existente cambia de tipo ni se vuelve NOT NULL,
-- y `esMayorista` lleva DEFAULT false, así que las filas actuales quedan como
-- proveedor puntual sin tocar un solo dato.

-- CreateEnum
CREATE TYPE "ActivityIncidentType" AS ENUM ('ACCESO_DENEGADO', 'FALTA_MATERIAL', 'FALLA_EQUIPO', 'CONDICION_INSEGURA', 'CLIMA', 'ALCANCE_ADICIONAL', 'RETRASO_CLIENTE', 'DANO_INSTALACION', 'OTRO');

-- CreateEnum
CREATE TYPE "ActivityIncidentSeverity" AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "RecommendationType" AS ENUM ('CORRECTIVO', 'PREVENTIVO', 'MEJORA', 'ACTUALIZACION', 'CAPACITACION', 'AMPLIACION');

-- CreateEnum
CREATE TYPE "RecommendationPriority" AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('ABIERTA', 'COTIZADA', 'ACEPTADA', 'RECHAZADA', 'DESCARTADA');

-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('DIARIA', 'PLANEACION_SEMANAL', 'REVISION_AVANCES', 'CIERRE_SEMANAL', 'EXTRAORDINARIA');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('PROGRAMADA', 'REALIZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "AgreementKind" AS ENUM ('ACUERDO', 'LECCION', 'RIESGO');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'CUMPLIDO', 'CANCELADO');

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "creditoDias" INTEGER,
ADD COLUMN     "descuentoBase" DECIMAL(5,2),
ADD COLUMN     "esMayorista" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "leadTimeDias" INTEGER,
ADD COLUMN     "limiteCredito" DECIMAL(14,2),
ADD COLUMN     "pedidoMinimo" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "supplier_price_breaks" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "cantidadMinima" DECIMAL(14,4) NOT NULL,
    "unitPrice" DECIMAL(14,4) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'MXN',
    "vigenteDesde" DATE,
    "vigenteHasta" DATE,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "supplier_price_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_incidents" (
    "id" SERIAL NOT NULL,
    "activityId" INTEGER NOT NULL,
    "tipo" "ActivityIncidentType" NOT NULL,
    "severidad" "ActivityIncidentSeverity" NOT NULL DEFAULT 'MEDIA',
    "descripcion" TEXT NOT NULL,
    "accionTomada" TEXT,
    "horasPerdidas" DECIMAL(6,2),
    "reportadoPorId" INTEGER,
    "resueltoPorId" INTEGER,
    "resueltoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "activity_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_recommendations" (
    "id" SERIAL NOT NULL,
    "activityId" INTEGER NOT NULL,
    "tipo" "RecommendationType" NOT NULL,
    "prioridad" "RecommendationPriority" NOT NULL DEFAULT 'MEDIA',
    "estado" "RecommendationStatus" NOT NULL DEFAULT 'ABIERTA',
    "descripcion" TEXT NOT NULL,
    "costoEstimado" DECIMAL(14,2),
    "cotizacionId" INTEGER,
    "creadoPorId" INTEGER,
    "cerradoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "activity_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_meetings" (
    "id" SERIAL NOT NULL,
    "tipo" "MeetingType" NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "fecha" DATE NOT NULL,
    "horaInicio" VARCHAR(5),
    "estado" "MeetingStatus" NOT NULL DEFAULT 'PROGRAMADA',
    "agenda" TEXT,
    "notas" TEXT,
    "facilitadorId" INTEGER,
    "realizadaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "operational_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_attendees" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "asistio" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_agreements" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "tipo" "AgreementKind" NOT NULL DEFAULT 'ACUERDO',
    "descripcion" TEXT NOT NULL,
    "responsableId" INTEGER,
    "fechaCompromiso" DATE,
    "estado" "AgreementStatus" NOT NULL DEFAULT 'PENDIENTE',
    "cumplidoAt" TIMESTAMP(3),
    "activityId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "meeting_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_price_breaks_productId_cantidadMinima_idx" ON "supplier_price_breaks"("productId", "cantidadMinima");

-- CreateIndex
CREATE INDEX "supplier_price_breaks_companyId_idx" ON "supplier_price_breaks"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_price_breaks_supplierId_productId_cantidadMinima_key" ON "supplier_price_breaks"("supplierId", "productId", "cantidadMinima");

-- CreateIndex
CREATE INDEX "activity_incidents_activityId_idx" ON "activity_incidents"("activityId");

-- CreateIndex
CREATE INDEX "activity_incidents_companyId_tipo_idx" ON "activity_incidents"("companyId", "tipo");

-- CreateIndex
CREATE INDEX "activity_incidents_companyId_severidad_resueltoAt_idx" ON "activity_incidents"("companyId", "severidad", "resueltoAt");

-- CreateIndex
CREATE INDEX "activity_recommendations_activityId_idx" ON "activity_recommendations"("activityId");

-- CreateIndex
CREATE INDEX "activity_recommendations_companyId_estado_idx" ON "activity_recommendations"("companyId", "estado");

-- CreateIndex
CREATE INDEX "activity_recommendations_cotizacionId_idx" ON "activity_recommendations"("cotizacionId");

-- CreateIndex
CREATE INDEX "operational_meetings_companyId_fecha_idx" ON "operational_meetings"("companyId", "fecha");

-- CreateIndex
CREATE INDEX "operational_meetings_companyId_tipo_fecha_idx" ON "operational_meetings"("companyId", "tipo", "fecha");

-- CreateIndex
CREATE INDEX "meeting_attendees_userId_idx" ON "meeting_attendees"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_attendees_meetingId_userId_key" ON "meeting_attendees"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "meeting_agreements_meetingId_idx" ON "meeting_agreements"("meetingId");

-- CreateIndex
CREATE INDEX "meeting_agreements_companyId_estado_fechaCompromiso_idx" ON "meeting_agreements"("companyId", "estado", "fechaCompromiso");

-- CreateIndex
CREATE INDEX "meeting_agreements_responsableId_estado_idx" ON "meeting_agreements"("responsableId", "estado");

-- AddForeignKey
ALTER TABLE "supplier_price_breaks" ADD CONSTRAINT "supplier_price_breaks_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_price_breaks" ADD CONSTRAINT "supplier_price_breaks_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_price_breaks" ADD CONSTRAINT "supplier_price_breaks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_incidents" ADD CONSTRAINT "activity_incidents_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_incidents" ADD CONSTRAINT "activity_incidents_reportadoPorId_fkey" FOREIGN KEY ("reportadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_incidents" ADD CONSTRAINT "activity_incidents_resueltoPorId_fkey" FOREIGN KEY ("resueltoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_incidents" ADD CONSTRAINT "activity_incidents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_recommendations" ADD CONSTRAINT "activity_recommendations_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_recommendations" ADD CONSTRAINT "activity_recommendations_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "cotizaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_recommendations" ADD CONSTRAINT "activity_recommendations_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_recommendations" ADD CONSTRAINT "activity_recommendations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_meetings" ADD CONSTRAINT "operational_meetings_facilitadorId_fkey" FOREIGN KEY ("facilitadorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_meetings" ADD CONSTRAINT "operational_meetings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "operational_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_agreements" ADD CONSTRAINT "meeting_agreements_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "operational_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_agreements" ADD CONSTRAINT "meeting_agreements_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_agreements" ADD CONSTRAINT "meeting_agreements_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_agreements" ADD CONSTRAINT "meeting_agreements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

