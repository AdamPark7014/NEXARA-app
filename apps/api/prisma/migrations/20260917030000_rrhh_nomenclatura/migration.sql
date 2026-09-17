-- Datos de RH en el perfil y número de empleado oficial (nomenclatura).
ALTER TABLE "UserProfile"
  ADD COLUMN "correoContacto" VARCHAR(150),
  ADD COLUMN "imssAlta" BOOLEAN,
  ADD COLUMN "documentosPendientes" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sueldoSemanal" DECIMAL(10,2),
  ADD COLUMN "funciones" JSONB,
  ADD COLUMN "nomenclaturaOrigen" VARCHAR(20);

-- La alerta de SLA vencido ya se emitía pero el tipo no existía.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SLA_BREACH';
