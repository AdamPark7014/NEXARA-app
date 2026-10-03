/**
 * Matriz Core · Clientes por encargado (sidebar + listas + pickers).
 * Alineada a ORG_EMAILS en activity-kinds.ts.
 */
import { ORG_EMAILS, kindsForCreator, kindsForTarget } from "@/lib/activity-kinds";
import { isCeoEquivalentEmail } from "@/lib/platform-accounts";
import { resolveV2RoleKey, type UserAccessInput } from "@/lib/rbac/role-mapping";

export type ClientSector = "PROYECTO" | "CORPORATIVO" | "COMERCIAL";

export const ALL_CLIENT_SECTORS: ClientSector[] = ["PROYECTO", "CORPORATIVO", "COMERCIAL"];

/**
 * Clave de icono del sector (sin emojis). La UI la traduce a un icono de
 * @mui/icons-material en components/erp/ClientSectorIcon.tsx.
 */
export type ClientSectorIconKey = "proyecto" | "corporativo" | "comercial";

export const CLIENT_SECTOR_META: Record<
  ClientSector,
  { slug: string; title: string; help: string; icon: ClientSectorIconKey }
> = {
  PROYECTO: {
    slug: "proyecto",
    title: "Clientes de proyecto",
    help: "Los clientes a los que se les lleva un proyecto, incluidos los que se dieron de alta rápido desde una actividad. Aquí se completan sus datos y se ven sus proyectos.",
    icon: "proyecto",
  },
  CORPORATIVO: {
    slug: "corporativo",
    title: "Clientes corporativos",
    help: "Los clientes de servicio, incluidos los que se dieron de alta rápido al crear una actividad. Aquí se completan sus datos.",
    icon: "corporativo",
  },
  COMERCIAL: {
    slug: "comercial",
    title: "Clientes comerciales",
    help: "Los clientes de cotizaciones y actividades comerciales. Un mismo cliente puede ser además de proyecto o corporativo.",
    icon: "comercial",
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
  if (isCeoEquivalentEmail(e)) return [...ALL_CLIENT_SECTORS];
  return SECTOR_MATRIX[e] ? [...SECTOR_MATRIX[e]] : [];
}

/**
 * Espejo de `apps/api/src/ventas/client-sectors.ts`.
 * El correo del encargado gana: Luis queda en corporativo y Daniela en comercial.
 */
const ROLE_SECTORS: Record<string, ClientSector[]> = {
  ceo: ALL_CLIENT_SECTORS,
  dir_admin: ALL_CLIENT_SECTORS,
  dir_operaciones: ALL_CLIENT_SECTORS,
  coord_admin: ALL_CLIENT_SECTORS,
  coord_operaciones: ALL_CLIENT_SECTORS,
  coord_ventas: ALL_CLIENT_SECTORS,
  arquitecto: ALL_CLIENT_SECTORS,
  enc_soporte: ALL_CLIENT_SECTORS,
  administrativo: ["COMERCIAL"],
  contabilidad: ["COMERCIAL"],
  rh: ["COMERCIAL"],
};

export function clientSectorsForRole(roleKey?: string | null): ClientSector[] {
  const role = String(roleKey || "").trim().toLowerCase();
  return ROLE_SECTORS[role] ? [...ROLE_SECTORS[role]] : [];
}

export function clientSectorsForUser(
  user?: { email?: string | null; roleKey?: string | null } | null,
): ClientSector[] {
  const byEmail = clientSectorsForEmail(user?.email);
  if (byEmail.length) return byEmail;
  const byRole = clientSectorsForRole(user?.roleKey);
  if (byRole.length) return byRole;
  // Quien lleva actividades comerciales sin estar en la matriz ni tener un rol de padrón
  // ve al menos a los clientes comerciales: el menú se lo enseña, la página no lo rebota.
  return tieneActividadesComerciales(user) ? ["COMERCIAL"] : [];
}

/**
 * ¿Trabaja con actividades de tipo comercial (las crea o se las asignan)?
 *
 * No hay otra lista: se pregunta a `activity-kinds.ts`, que es donde se decide quién crea
 * y quién recibe cada tipo. Hoy son Christian y su equivalente, la cuenta de desarrollo y
 * los encargados de área (David, Luis, Antonio, Daniela, Mónica, Josué, Paulina). Quien
 * se sume allá aparece aquí sin tocar este archivo.
 */
export function tieneActividadesComerciales(user?: UserAccessInput | null): boolean {
  if (!user) return false;
  const puedeCrear = kindsForCreator({
    v2Role: resolveV2RoleKey(user),
    email: user.email,
    isSuperAdmin: Boolean(user.isSuperAdmin),
  }).includes("comercial");
  return puedeCrear || kindsForTarget(user.email).includes("comercial");
}

/**
 * «Clientes» en el menú lateral: quienes llevan actividades comerciales, para mantener ahí
 * los datos de sus clientes recurrentes. La página sigue abierta para quien llegue por un
 * enlace y tenga padrón (`canAccessClientPadron`).
 */
export function puedeVerModuloClientes(user?: UserAccessInput | null): boolean {
  return tieneActividadesComerciales(user);
}

export function canSeeClientesModule(email?: string | null): boolean {
  return clientSectorsForEmail(email).length > 0;
}

/** Menú y páginas de Clientes: por persona (correo) o por rol de coordinación/gerencia. */
export function canAccessClientPadron(
  user?: { email?: string | null; roleKey?: string | null } | null,
): boolean {
  return clientSectorsForUser(user).length > 0;
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
    // Quien puede crear comercial sin estar en la matriz de Clientes (Paulina) usa el padrón
    // comercial: sin él, el cliente obligatorio salía vacío y no podía guardar la actividad.
    return allowed.length ? allowed : ["COMERCIAL"];
  }
  return [];
}
