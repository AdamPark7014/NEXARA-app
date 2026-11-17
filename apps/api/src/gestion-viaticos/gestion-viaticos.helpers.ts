/**
 * Helpers puros de la mesa de Liz: tipos de ticket, plazos de facturación y
 * urgencia de la bandeja. Sin Nest ni Prisma: se prueban solos.
 */

export const TIPOS_TICKET = [
  'GASOLINA',
  'CASETA',
  'COMIDA',
  'HOSPEDAJE',
  'ESTACIONAMIENTO',
  'OTRO',
] as const;

export type TipoTicket = (typeof TIPOS_TICKET)[number];

export const ESTADOS_TICKET = [
  'PENDIENTE',
  'APROBADO',
  'RECHAZADO',
  'FACTURADO',
  'NO_FACTURABLE',
] as const;

export type EstadoTicket = (typeof ESTADOS_TICKET)[number];

/** Clases de fila en la bandeja, de más a menos urgente. */
export const URGENCIAS = [
  'ticket_hoy',
  'comprobacion',
  'viatico',
  'vehiculo',
  'multa',
  'mantenimiento',
  'sin_responsable',
] as const;

export type Urgencia = (typeof URGENCIAS)[number];

export type FilaBandeja = {
  clave: string;
  urgencia: Urgencia;
  titulo: string;
  resumen: string;
  accion: string;
  href: string;
  entidadId: number;
  venceHoy?: boolean;
  monto?: number | null;
  createdAt?: string | null;
  fotoUrl?: string;
  puedeRevisar?: boolean;
};

const PRIORIDAD: Record<Urgencia, number> = {
  ticket_hoy: 0,
  comprobacion: 1,
  viatico: 2,
  vehiculo: 3,
  multa: 4,
  mantenimiento: 5,
  sin_responsable: 6,
};

export function normalizarTipo(raw?: string | null): TipoTicket {
  const value = String(raw || 'OTRO')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  if ((TIPOS_TICKET as readonly string[]).includes(value)) return value as TipoTicket;
  if (value === 'COMBUSTIBLE' || value === 'FUEL') return 'GASOLINA';
  if (value === 'ALIMENTACION' || value === 'ALIMENTACIÓN') return 'COMIDA';
  if (value === 'TRANSPORTE') return 'OTRO';
  return 'OTRO';
}

/** Día civil YYYY-MM-DD en zona de México a partir de un instante. */
export function diaMexico(instante: Date, tz = 'America/Mexico_City'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
}

/**
 * Plazo de facturación: gasolina = mismo día del ticket por omisión; el resto
 * deja null (sin urgencia de «hoy») salvo que el usuario lo ponga.
 */
export function plazoFacturacionPorOmision(
  tipo: TipoTicket,
  fechaHora: Date,
  puedeFacturar: boolean,
): Date | null {
  if (!puedeFacturar) return null;
  if (tipo !== 'GASOLINA') return null;
  const dia = diaMexico(fechaHora);
  return new Date(`${dia}T00:00:00.000Z`);
}

export function venceHoy(fechaLimite: Date | string | null | undefined, hoy = diaMexico(new Date())): boolean {
  if (!fechaLimite) return false;
  const raw = typeof fechaLimite === 'string' ? fechaLimite : fechaLimite.toISOString();
  return raw.slice(0, 10) === hoy;
}

export function ordenarBandeja(filas: FilaBandeja[]): FilaBandeja[] {
  return [...filas].sort((a, b) => {
    const pa = PRIORIDAD[a.urgencia] - PRIORIDAD[b.urgencia];
    if (pa !== 0) return pa;
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return ta - tb;
  });
}

/** Suma de montos de tickets que ya cuentan como costo (aprobados o facturados). */
export function sumaTicketsParaCosto(
  tickets: ReadonlyArray<{ estado: string; monto: unknown }>,
): number {
  let total = 0;
  for (const t of tickets) {
    const est = String(t.estado || '').toUpperCase();
    if (est !== 'APROBADO' && est !== 'FACTURADO' && est !== 'NO_FACTURABLE') continue;
    const n =
      typeof t.monto === 'object' && t.monto && 'toNumber' in (t.monto as object)
        ? (t.monto as { toNumber: () => number }).toNumber()
        : Number(t.monto);
    if (Number.isFinite(n) && n > 0) total += n;
  }
  return Math.round(total * 100) / 100;
}

export function esGestora(roleKey?: string | null, isSuperAdmin?: boolean): boolean {
  if (isSuperAdmin) return true;
  return roleKey === 'coord_admin' || roleKey === 'ceo' || roleKey === 'super_admin';
}

export function esContadora(actor: {
  roleKey?: string | null;
  email?: string | null;
  puesto?: string | null;
  isSuperAdmin?: boolean;
}): boolean {
  if (actor.isSuperAdmin) return true;
  if (actor.roleKey === 'contabilidad') return true;
  if (actor.roleKey === 'administrativo') {
    const puesto = String(actor.puesto || '').toLowerCase();
    const email = String(actor.email || '').toLowerCase();
    if (puesto.includes('contadora') || puesto.includes('contable') || puesto.includes('finanza')) return true;
    if (email.startsWith('finanzas@')) return true;
  }
  return false;
}
