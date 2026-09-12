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

export function canSeeClientesModule(email?: string | null): boolean {
  return clientSectorsForEmail(email).length > 0;
}

export function isClientSector(value: unknown): value is ClientSectorCode {
  return typeof value === 'string' && ALL_CLIENT_SECTORS.includes(value as ClientSectorCode);
}

export function needsOpsProvision(sectors: ClientSectorCode[]): boolean {
  return sectors.includes('PROYECTO') || sectors.includes('CORPORATIVO');
}
