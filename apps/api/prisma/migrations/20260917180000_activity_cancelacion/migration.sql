-- Cancelación documentada de actividades: solo superiores de quien la ejecuta, con motivo.
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "cancelledById" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Activity_cancelledById_fkey'
  ) THEN
    ALTER TABLE "Activity"
      ADD CONSTRAINT "Activity_cancelledById_fkey"
      FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Aviso «<Actividad> fue cancelada».
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACTIVITY_CANCELLED';
