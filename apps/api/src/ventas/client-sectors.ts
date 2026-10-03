/**
 * Matriz Core · Clientes por encargado (API). Espejo de apps/web/lib/client-sectors.ts.
 */

export type ClientSectorCode = 'PROYECTO' | 'CORPORATIVO' | 'COMERCIAL';

export const ALL_CLIENT_SECTORS: ClientSectorCode[] = ['PROYECTO', 'CORPORATIVO', 'COMERCIAL'];

const ORG_EMAILS = {
  ceo: 'gerencia@nexara.com.mx',
  developer: 'developer@nexara.com.mx',
  david: 'operaciones@nexara.com.mx',
  luis: 'direccion.operaciones@nexara.com.mx',
  antonio: 'jose.ramirez@nexara.com.mx',
  daniela: 'daniela.hernandez@nexara.com.mx',
  monica: 'soluciones@nexara.com.mx',
  josue: 'infraestructura@nexara.com.mx',
} as const;

function norm(email?: string | null): string {
  return String(email || '')
    .trim()
    .toLowerCase();
}

const SECTOR_MATRIX: Record<string, ClientSectorCode[]> = {
  [ORG_EMAILS.ceo]: ALL_CLIENT_SECTORS,
  [ORG_EMAILS.developer]: ALL_CLIENT_SECTORS,
  [ORG_EMAILS.antonio]: ALL_CLIENT_SECTORS,
  [ORG_EMAILS.luis]: ['CORPORATIVO'],
  [ORG_EMAILS.david]: ['PROYECTO', 'COMERCIAL'],
  [ORG_EMAILS.josue]: ['PROYECTO', 'COMERCIAL'],
  [ORG_EMAILS.monica]: ['PROYECTO', 'COMERCIAL'],
  [ORG_EMAILS.daniela]: ['COMERCIAL'],
};

export function clientSectorsForEmail(email?: string | null): ClientSectorCode[] {
  const e = norm(email);
  if (!e) return [];
  return SECTOR_MATRIX[e] ? [...SECTOR_MATRIX[e]] : [];
}

/**
 * Sectores por rol cuando la persona no está en la matriz de correos.
 * El correo del encargado gana (`clientSectorsForActor`): Luis sigue en corporativo
 * y Daniela en comercial aunque el rol, por sí solo, abra más.
 */
const ROLE_SECTORS: Record<string, ClientSectorCode[]> = {
  ceo: ALL_CLIENT_SECTORS,
  dir_admin: ALL_CLIENT_SECTORS,
  dir_operaciones: ALL_CLIENT_SECTORS,
  coord_admin: ALL_CLIENT_SECTORS,
  coord_operaciones: ALL_CLIENT_SECTORS,
  coord_ventas: ALL_CLIENT_SECTORS,
  arquitecto: ALL_CLIENT_SECTORS,
  enc_soporte: ALL_CLIENT_SECTORS,
  administrativo: ['COMERCIAL'],
  contabilidad: ['COMERCIAL'],
  rh: ['COMERCIAL'],
};

export function clientSectorsForRole(roleKey?: string | null): ClientSectorCode[] {
  const role = String(roleKey || '').trim().toLowerCase();
  return ROLE_SECTORS[role] ? [...ROLE_SECTORS[role]] : [];
}

export function clientSectorsForActor(actor?: { email?: string | null; roleKey?: string | null } | null): ClientSectorCode[] {
  const byEmail = clientSectorsForEmail(actor?.email);
  if (byEmail.length) return byEmail;
  return clientSectorsForRole(actor?.roleKey);
}

export function canSeeClientesModule(email?: string | null): boolean {
  return clientSectorsForEmail(email).length > 0;
}

export function canAccessClientPadron(actor?: { email?: string | null; roleKey?: string | null } | null): boolean {
  return clientSectorsForActor(actor).length > 0;
}

export function isClientSector(value: unknown): value is ClientSectorCode {
  return typeof value === 'string' && ALL_CLIENT_SECTORS.includes(value as ClientSectorCode);
}

export function needsOpsProvision(sectors: ClientSectorCode[]): boolean {
  return sectors.includes('PROYECTO') || sectors.includes('CORPORATIVO');
}

/**
 * Tipos de un cliente: puede ser de proyecto, corporativo y comercial a la vez.
 * La membresía vive en `sales_client_sectors`; `tipo` es el principal (con el que nació)
 * y cuenta aunque la fila de membresía falte (altas viejas que no la escribían).
 */
export function sectoresDelCliente(
  client?: { tipo?: string | null; sectors?: Array<{ sector: string }> | null } | null,
): ClientSectorCode[] {
  const out: ClientSectorCode[] = [];
  for (const valor of [client?.tipo, ...(client?.sectors ?? []).map((s) => s.sector)]) {
    if (isClientSector(valor) && !out.includes(valor)) out.push(valor);
  }
  return out;
}

/**
 * Filtro de Prisma para «clientes de este tipo»: por membresía o por tipo principal.
 * Va dentro de `AND` para no chocar con otro `OR` del mismo `where`.
 */
export function filtroPorSector(sector: ClientSectorCode) {
  return { OR: [{ tipo: sector }, { sectors: { some: { sector } } }] };
}

/** El nombre como se guarda y se compara: sin espacios de más al inicio, al final ni en medio. */
export function nombreClienteLimpio(nombre?: string | null): string {
  return String(nombre || '')
    .replace(/\s+/g, ' ')
    .trim();
}
