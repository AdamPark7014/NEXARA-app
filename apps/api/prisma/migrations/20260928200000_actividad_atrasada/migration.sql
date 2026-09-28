-- Aviso de actividad en rojo: una marca para no repetir el push.
-- Aditiva y nula. Las filas viejas no avisaron todavía (null) y el cron las
-- toma la primera vez que las vea atrasadas.
-- ACTIVITY_OVERDUE entra al enum de notificaciones (campana + push).

ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "overdueAlertedAt" TIMESTAMP(3);

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACTIVITY_OVERDUE';
