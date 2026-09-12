/**
 * Matriz Core · Clientes por encargado (sidebar + listas + pickers).
 * Alineada a ORG_EMAILS en activity-kinds.ts.
 */
import { ORG_EMAILS } from "@/lib/activity-kinds";

export type ClientSector = "PROYECTO" | "CORPORATIVO" | "COMERCIAL";

export const ALL_CLIENT_SECTORS: ClientSector[] = ["PROYECTO", "CORPORATIVO", "COMERCIAL"];

export const CLIENT_SECTOR_META: Record<
  ClientSector,
  { slug: string; title: string; help: string; emoji: string }
> = {
  PROYECTO: {
    slug: "proyecto",
    title: "Clientes de proyecto",
    help: "Se usan en actividades de tipo proyecto u obra. Aquí también creas sus proyectos.",
    emoji: "📁",
  },
  CORPORATIVO: {
    slug: "corporativo",
    title: "Clientes corporativos",
    help: "Se usan en actividades de tipo servicio.",
    emoji: "🏢",
  },
  COMERCIAL: {
    slug: "comercial",
    title: "Clientes comerciales",
    help: "Se usan en actividades de tipo comercial (también puedes sumarlos a otros sectores).",
    emoji: "🤝",
  },
};

function norm(email?: string | null): string {
  return String(email || "")
    .trim()
    .toLowerCase();
}

const SECTOR_MATRIX: Record<string, ClientSector[]> = {
  [ORG_EMAILS.ceo]: ALL_CLIENT_SECTORS,
  [ORG_EMAILS.developer]: ALL_CLIENT_SECTORS,
  [ORG_EMAILS.antonio]: ALL_CLIENT_SECTORS,
  [ORG_EMAILS.luis]: ["CORPORATIVO"],
  [ORG_EMAILS.david]: ["PROYECTO", "COMERCIAL"],
  [ORG_EMAILS.josue]: ["PROYECTO", "COMERCIAL"],
  [ORG_EMAILS.monica]: ["PROYECTO", "COMERCIAL"],
  [ORG_EMAILS.daniela]: ["COMERCIAL"],
};

export function clientSectorsForEmail(email?: string | null): ClientSector[] {
  const e = norm(email);
  if (!e) return [];
  return SECTOR_MATRIX[e] ? [...SECTOR_MATRIX[e]] : [];
}

export function canSeeClientesModule(email?: string | null): boolean {
  return clientSectorsForEmail(email).length > 0;
}

export function canSeeClientSector(email: string | null | undefined, sector: ClientSector): boolean {
  return clientSectorsForEmail(email).includes(sector);
}

export function sectorFromSlug(slug: string): ClientSector | null {
  const hit = ALL_CLIENT_SECTORS.find((s) => CLIENT_SECTOR_META[s].slug === slug);
  return hit ?? null;
}

export function slugFromSector(sector: ClientSector): string {
  return CLIENT_SECTOR_META[sector].slug;
}

/** Sectores de clientes disponibles al asignar un tipo de actividad. */
export function clientSectorsForActivityKind(
  kind: "tarea" | "proyecto" | "obra" | "servicio" | "comercial",
  email?: string | null,
): ClientSector[] {
  const allowed = clientSectorsForEmail(email);
  if (kind === "proyecto" || kind === "obra") {
    return allowed.filter((s) => s === "PROYECTO");
  }
  if (kind === "servicio") {
    return allowed.filter((s) => s === "CORPORATIVO");
  }
  if (kind === "comercial") {
    return allowed;
  }
  return [];
}
