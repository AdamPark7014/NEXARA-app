-- Phase 8: alertas cross-módulo (margen, SLA mantenimiento, stock crítico)
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MARGIN_ALERT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SLA_ALERT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'STOCK_ALERT';
