/**
 * Seguimiento de cotizaciones (Adam, 01-11-2026, Programa Velocidad Core): «que se lleve un estatus,
 * que esté preguntándole a la persona que hizo la cotización, le lleguen notificaciones».
 *
 * Medido: 56 de 56 en borrador y ningún envío desde el sistema, porque el PDF sale por WhatsApp o por
 * fuera. Sin saber que salió, nada de lo demás arranca.
 *
 * Módulo puro (sin Nest ni Prisma).
 */

/** Cómo se puede marcar que salió, sin pasar por el correo del sistema. */
export const MEDIOS_ENVIO = ['WHATSAPP', 'CORREO_EXTERNO', 'EN_PERSONA', 'OTRO'] as const;
export type MedioEnvio = (typeof MEDIOS_ENVIO)[number];

/** Días desde que salió en que se pregunta si ya hubo respuesta. */
export const DIAS_SEGUIMIENTO = [3, 7];
/** Horas de borrador antes de preguntar si ya la mandó. */
export const HORAS_BORRADOR = 48;

const DIA_MS = 24 * 60 * 60 * 1000;

/** La etapa que toca avisar ahora, o null. Si pasaron varias, una sola: no se manda dos veces. */
export function etapaDeSeguimiento(p: { sentAt: Date; etapaActual: number; ahora: Date }): number | null {
  const dias = (p.ahora.getTime() - p.sentAt.getTime()) / DIA_MS;
  const alcanzada = DIAS_SEGUIMIENTO.filter((d) => dias >= d).length;
  return alcanzada > p.etapaActual ? alcanzada : null;
}

/** La hoja del cliente: la empresa o, si no hay, la persona. */
function clienteDe(c: { clientCompany?: string | null; clientName?: string | null }): string {
  return c.clientCompany?.trim() || c.clientName?.trim() || 'el cliente';
}

export function textoSeguimiento(c: {
  quoteNumber: string;
  clientCompany?: string | null;
  clientName?: string | null;
  sentAt: Date;
  ahora: Date;
}): { title: string; message: string } {
  const dias = Math.max(1, Math.floor((c.ahora.getTime() - c.sentAt.getTime()) / DIA_MS));
  return {
    title: `¿Ya hubo respuesta de ${clienteDe(c)}?`,
    message: `${c.quoteNumber} salió hace ${dias} ${dias === 1 ? 'día' : 'días'}. Dale seguimiento o márcala como aprobada o rechazada.`,
  };
}

export function textoBorradores(n: number): { title: string; message: string } {
  return {
    title: n === 1 ? '¿Ya mandaste tu cotización?' : `¿Ya mandaste tus ${n} cotizaciones?`,
    message: 'Si ya salieron, márcalas con «Ya la envié» para que les demos seguimiento.',
  };
}
