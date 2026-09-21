/**
 * Envío interno de una cotización: pasársela a otro compañero que también cotiza.
 *
 * No es el envío al cliente (eso es `POST :id/enviar`, que congela folio y versión). Esto solo dice
 * **a quién le toca ahora**: quien la elaboró sigue siendo el autor y el folio no se mueve.
 *
 * Quién puede recibirla no se decide aquí por nombre ni por correo, sino por su clave de rol contra
 * `ROLES_QUE_COTIZAN` (`common/rbac/roles.v2.ts`), que es la misma lista con la que `AuthService`
 * reparte `cotizaciones.access`. Si mañana cambia quién cotiza, cambia ahí y esto lo sigue.
 *
 * Módulo puro (sin Nest ni Prisma) para poder probarlo con jest.
 */
import { puedeCotizar } from '../common/rbac/roles.v2.js';

/** Lo que hace falta saber de la persona que va a recibirla. */
export type CandidatoEnvioInterno = {
  id: number;
  nombre?: string | null;
  roleKey?: string | null;
  isActive?: boolean | null;
  companyId?: number | null;
};

export const MAX_NOTA = 500;

/**
 * ¿Esta persona puede quedarse con la cotización?
 *
 * Se pide rol que cotice **y** cuenta activa: pasarle el trabajo a alguien que ya no entra al
 * sistema es perderlo en silencio.
 */
export function puedeRecibirCotizacion(candidato: CandidatoEnvioInterno | null | undefined): boolean {
  if (!candidato) return false;
  if (candidato.isActive === false) return false;
  return puedeCotizar(candidato.roleKey);
}

/** La nota del traspaso: una línea, sin saltos raros y acotada. */
export function limpiarNota(nota: unknown): string | null {
  const texto = String(nota ?? '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, MAX_NOTA);
  return texto || null;
}

export type ProblemaEnvioInterno = 'BLOQUEADA' | 'SIN_DESTINATARIO' | 'A_TI_MISMO' | 'OTRA_EMPRESA' | 'NO_COTIZA';

export const MENSAJE_PROBLEMA: Record<ProblemaEnvioInterno, string> = {
  BLOQUEADA:
    'Esta cotización ya salió al cliente: crea una versión nueva antes de pasársela a alguien.',
  SIN_DESTINATARIO: 'Elige a quién se la pasas.',
  A_TI_MISMO: 'Ya es tuya: elige a otra persona.',
  OTRA_EMPRESA: 'Esa persona no pertenece a esta empresa.',
  NO_COTIZA:
    'Esa persona no cotiza. Solo puedes pasársela a quien puede crear y editar cotizaciones.',
};

/**
 * Qué impide el traspaso, o `null` si se puede hacer.
 *
 * El orden importa: primero el estado de la cotización (da igual a quién se la pases si ya salió),
 * luego quién la recibe.
 */
export function revisarEnvioInterno(params: {
  bloqueada: boolean;
  actorId: number | null | undefined;
  companyId: number | null | undefined;
  destinatario: CandidatoEnvioInterno | null | undefined;
}): ProblemaEnvioInterno | null {
  if (params.bloqueada) return 'BLOQUEADA';
  if (!params.destinatario) return 'SIN_DESTINATARIO';
  if (params.actorId != null && params.destinatario.id === params.actorId) return 'A_TI_MISMO';
  if (
    params.companyId != null &&
    params.destinatario.companyId != null &&
    params.destinatario.companyId !== params.companyId
  ) {
    return 'OTRA_EMPRESA';
  }
  if (!puedeRecibirCotizacion(params.destinatario)) return 'NO_COTIZA';
  return null;
}

/** Título y cuerpo del aviso que le llega a quien la recibe (campana y push). */
export function avisoDeTraspaso(params: {
  folio: string;
  deNombre?: string | null;
  nota?: string | null;
}): { titulo: string; mensaje: string } {
  const quien = (params.deNombre ?? '').trim();
  const nota = limpiarNota(params.nota);
  const cuerpo = quien
    ? `${quien} te pasó la cotización ${params.folio}.`
    : `Te pasaron la cotización ${params.folio}.`;
  return {
    titulo: 'Te pasaron una cotización',
    // La nota es el motivo del traspaso: si la hay, es lo primero que hace falta leer.
    mensaje: nota ? `${cuerpo} ${nota}` : cuerpo,
  };
}
