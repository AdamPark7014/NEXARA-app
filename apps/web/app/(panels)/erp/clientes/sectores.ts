import type { ClientSector } from "@/lib/client-sectors";

const NOMBRE_CORTO: Record<ClientSector, string> = {
  PROYECTO: "Proyecto",
  CORPORATIVO: "Corporativo",
  COMERCIAL: "Comercial",
};

/** En Clientes va primero Comercial: es de donde salen las cotizaciones y los clientes nuevos. */
const ORDEN_PESTANAS: ClientSector[] = ["COMERCIAL", "PROYECTO", "CORPORATIVO"];

export function ordenarSectores(sectores: ClientSector[]): ClientSector[] {
  return ORDEN_PESTANAS.filter((s) => sectores.includes(s));
}

/** El nombre corto del sector para pestañas, chips y botones. */
export function nombreSector(sector: ClientSector): string {
  return NOMBRE_CORTO[sector] ?? "Otro sector";
}
