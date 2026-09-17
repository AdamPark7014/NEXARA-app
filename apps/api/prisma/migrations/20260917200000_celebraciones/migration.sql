-- Celebraciones del equipo: cumpleaños y aniversarios de ingreso.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BIRTHDAY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WORK_ANNIVERSARY';
