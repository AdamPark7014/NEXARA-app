import type { ClientSector } from "@/lib/client-sectors";

const NOMBRE_CORTO: Record<ClientSector, string> = {
  PROYECTO: "Proyecto",
  CORPORATIVO: "Corporativo",
  COMERCIAL: "Comercial",
};

/** El nombre corto del sector para pestañas, chips y botones. */
export function nombreSector(sector: ClientSector): string {
  return NOMBRE_CORTO[sector] ?? "Otro sector";
}
