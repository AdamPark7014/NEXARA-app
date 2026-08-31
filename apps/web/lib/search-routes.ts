/**
 * Rutas web canónicas para resultados de búsqueda global.
 */
import type { GlobalSearchResult } from "@/lib/search-api";

const TYPE_LABELS: Record<string, string> = {
  user: "Usuario",
  "sales-client": "Cliente",
  "sales-project": "Proyecto comercial",
  "operational-project": "Proyecto OPS",
  activity: "Actividad",
  invoice: "Factura",
  asset: "Activo",
  vehicle: "Vehículo",
};

const TYPE_ICONS: Record<string, string> = {
  user: "👤",
  "sales-client": "🏢",
  "sales-project": "📁",
  "operational-project": "🔧",
  activity: "📋",
  invoice: "🧾",
  asset: "⚙️",
  vehicle: "🚗",
};

export function searchResultTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

export function searchResultIcon(type: string): string {
  return TYPE_ICONS[type] ?? "🔎";
}

export function searchResultUrl(result: GlobalSearchResult): string | null {
  const { type, id } = result;
  switch (type) {
    case "user":
      return "/erp/users";
    case "sales-client":
      return `/crm/clients/${id}`;
    case "sales-project":
      return `/crm/projects/${id}`;
    case "operational-project":
      return `/ops/projects/${id}`;
    case "activity":
      return `/ops/activities/${id}`;
    case "invoice":
      return `/erp/invoicing/${id}`;
    case "asset":
      return `/ops/assets?highlight=${id}`;
    case "vehicle":
      return `/ops/vehicles?highlight=${id}`;
    default:
      return null;
  }
}
