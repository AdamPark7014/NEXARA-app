/**
 * Nombres legibles para claves técnicas de Configuración (alcances de API y
 * eventos de webhook). La clave cruda se sigue enviando al backend.
 */

export const API_SCOPE_LABEL: Record<string, { label: string; description: string }> = {
  "accounting.read": { label: "Contabilidad · lectura", description: "Consultar pólizas, cuentas y reportes." },
  "accounting.write": { label: "Contabilidad · escritura", description: "Crear y modificar pólizas." },
  "procurement.read": { label: "Compras · lectura", description: "Consultar órdenes de compra y proveedores." },
  "procurement.write": { label: "Compras · escritura", description: "Crear y modificar órdenes de compra." },
  "webhooks.manage": { label: "Administrar webhooks", description: "Crear, pausar y eliminar avisos automáticos." },
  scim: { label: "Aprovisionamiento de usuarios (SCIM)", description: "Alta y baja automática de cuentas desde tu directorio." },
};

export function scopeLabel(scope: string): string {
  return API_SCOPE_LABEL[scope]?.label ?? humanizeTechKey(scope);
}

export const WEBHOOK_EVENT_LABEL: Record<string, string> = {
  "approval.requested": "Aprobación solicitada",
  "approval.approved": "Aprobación concedida",
  "approval.rejected": "Aprobación rechazada",
  "invoice.paid": "Factura pagada",
  "invoice.overdue": "Factura vencida",
  "stock.low": "Inventario bajo",
  "stock.dead": "Inventario sin movimiento",
  "ticket.sla_breach": "Ticket fuera de tiempo",
  "user.locked": "Cuenta bloqueada",
  "user.inactive": "Cuenta inactiva",
  "opportunity.won": "Oportunidad ganada",
  "opportunity.lost": "Oportunidad perdida",
  "payment.registered": "Pago registrado",
  "quote.created": "Cotización creada",
  "quote.approved": "Cotización aprobada",
  "quote.discount_approved": "Descuento aprobado",
  "quote.discount_rejected": "Descuento rechazado",
  "expense.approved": "Gasto aprobado",
  "expense.rejected": "Gasto rechazado",
  "viatic.approved": "Viático aprobado",
  "viatic.rejected": "Viático rechazado",
  "purchase_order.confirmed": "Orden de compra confirmada",
  "purchase_order.rejected": "Orden de compra rechazada",
  "sales_project.approved": "Proyecto de venta aprobado",
  "sales_project.rejected": "Proyecto de venta rechazado",
  "activity.completed": "Actividad terminada",
  "activity.closure_approved": "Cierre de actividad aprobado",
  "activity.closure_rejected": "Cierre de actividad rechazado",
  "client.created": "Cliente creado",
  "client.updated": "Cliente actualizado",
  ping: "Prueba de conexión",
};

export function eventLabel(ev: string): string {
  return WEBHOOK_EVENT_LABEL[ev] ?? humanizeTechKey(ev);
}

function humanizeTechKey(key: string): string {
  const s = key.replace(/[._-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : key;
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
