-- Entrada sin ubicación completada con el primer punto del GPS de jornada.
--
-- Pedido de Adam (23-10-2026): si al checar la entrada no hubo ubicación, se le asigna el primer
-- punto que llegue en los 30 min siguientes, marcado como tomado después, en lugar de «Sin ubicación».
-- Esta columna guarda la hora de ese punto (null = la ubicación es la de la checada, o no hay).
--
-- Aditiva: una columna nullable, sin valor por defecto ni backfill. Idempotente.

ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "ubicacionPosteriorAt" TIMESTAMP(3);
