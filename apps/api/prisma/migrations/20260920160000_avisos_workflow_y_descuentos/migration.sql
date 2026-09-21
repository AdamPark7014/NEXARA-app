-- Avisos que se emitían con un valor que no existía en el enum de la base.
--
-- La API llamaba a createNotification con estos `type`, Postgres rechazaba el INSERT en
-- "notifications" (tipo "NotificationType") y el emisor se tragaba el error en su catch:
-- ni aviso en la web ni push al teléfono. En concreto, NINGUNA aprobación de flujo
-- (/erp/approvals) ni descuento de cotización avisaba a nadie.
--
-- Todo es aditivo: agregar valores a un enum no toca las filas existentes.
-- El enum en Postgres se llama "NotificationType" (el modelo Prisma Notification mapea a
-- la tabla "notifications", pero el enum no lleva @@map y conserva su nombre).

-- Cadena de aprobaciones (workflow.service.ts, workflow-timeout.cron.ts)
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WORKFLOW_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WORKFLOW_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WORKFLOW_PENDING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WORKFLOW_ESCALATION';

-- Descuento de cotización resuelto por workflow (cotizaciones.service.ts)
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'QUOTE_DISCOUNT_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'QUOTE_DISCOUNT_REJECTED';

-- Proyecto de ventas resuelto por workflow (ventas.service.ts)
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SALES_PROJECT_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SALES_PROJECT_REJECTED';

-- Sobrepresupuesto / margen bajo de un proyecto de ventas. Lo emite la tarea programada
-- (cron.service.ts → notifyProjectMarginAlert), así que llevaba fallando en cada corrida.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SALES_PROJECT_MARGIN_ALERT';

-- Uso de vehículo por vencer (notification-hierarchy.service.ts)
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'VEHICLE_USAGE_EXPIRING';

-- Borrador de pedido a CT Online listo (notifications.service.ts)
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CT_ORDER_DRAFT';

-- Validación de cierre de OT rechazada: vuelve a campo (activity-lifecycle.service.ts)
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACTIVITY_VALIDATION_REJECTED';
