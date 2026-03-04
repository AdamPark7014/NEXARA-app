-- Ensure notification enum contains values used by API services.
-- This migration is idempotent and safe to run on environments with partial enum history.
DO $$
BEGIN
  ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_CHECKIN';
  ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_CHECKOUT';
  ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_ABSENCE';
  ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_UPDATE';
  ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LUNCH_CHECKIN';
  ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LUNCH_CHECKOUT';
END $$;
