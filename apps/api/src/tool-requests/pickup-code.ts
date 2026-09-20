/**
 * Código de recolección en almacén.
 *
 * Regla del dueño: «una vez aprobada la solicitud se da acceso a almacén para la
 * recolección». El control de acceso de oficinas (`access-control`) hoy no sabe otorgar
 * un permiso de puerta temporal —`createAccessRule` responde 501 y no hay puerta de
 * almacén modelada—, así que la credencial es este código: corto, se dicta de viva voz
 * o se lee de la pantalla, y caduca.
 *
 * Caducar importa: una solicitud aprobada el lunes no debe abrir el almacén el viernes.
 *
 * Aritmética y formato puros, sin Prisma ni reloj del sistema.
 */

import { randomInt } from 'node:crypto';

/** Cuánto vale el código desde que se aprueba. Dos días cubre el fin de semana corto. */
export const PICKUP_VIGENCIA_HORAS = 48;

/**
 * Alfabeto sin caracteres que se confunden al dictarlos o al leerlos de una pantalla
 * rayada: nada de O/0, I/1/L, S/5, B/8.
 */
const ALFABETO = 'ACDEFGHJKMNPQRTUVWXY234679';

export const LARGO_PICKUP_CODE = 6;

/**
 * Un código nuevo. `aleatorio` se puede inyectar en pruebas; por defecto usa
 * `crypto.randomInt`, que no es adivinable (Math.random sí lo sería, y este código es
 * lo único que separa a cualquiera de llevarse una herramienta).
 */
export function generarPickupCode(
  aleatorio: (tope: number) => number = randomIntSeguro,
): string {
  let codigo = '';
  for (let i = 0; i < LARGO_PICKUP_CODE; i += 1) {
    codigo += ALFABETO[aleatorio(ALFABETO.length)];
  }
  return codigo;
}

function randomIntSeguro(tope: number): number {
  return randomInt(0, tope);
}

/** Cuándo caduca un código aprobado ahora. */
export function vencimientoPickup(desde: Date, horas = PICKUP_VIGENCIA_HORAS): Date {
  return new Date(desde.getTime() + horas * 3600_000);
}

/** Normaliza lo que teclea el almacén: espacios, guiones y minúsculas dan igual. */
export function normalizarPickupCode(valor: unknown): string {
  return String(valor ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export type EstadoPickup =
  | { valido: true }
  | { valido: false; motivo: 'SIN_CODIGO' | 'NO_COINCIDE' | 'VENCIDO' | 'YA_RECOGIDA'; mensaje: string };

/**
 * ¿Sirve este código para llevarse la herramienta? Devuelve el motivo para poder
 * decírselo al almacenista en vez de un «código inválido» que no explica nada.
 */
export function validarPickup(
  solicitud: {
    pickupCode?: string | null;
    pickupExpiresAt?: Date | null;
    pickedUpAt?: Date | null;
  },
  codigoTecleado: unknown,
  ahora: Date,
): EstadoPickup {
  if (solicitud.pickedUpAt) {
    return {
      valido: false,
      motivo: 'YA_RECOGIDA',
      mensaje: 'Esta solicitud ya se recogió. Pide una nueva si necesitas la herramienta otra vez.',
    };
  }

  const guardado = normalizarPickupCode(solicitud.pickupCode);
  if (!guardado) {
    return {
      valido: false,
      motivo: 'SIN_CODIGO',
      mensaje: 'La solicitud no tiene código de recolección. Debe aprobarse primero.',
    };
  }

  if (normalizarPickupCode(codigoTecleado) !== guardado) {
    return {
      valido: false,
      motivo: 'NO_COINCIDE',
      mensaje: 'El código no coincide con esta solicitud.',
    };
  }

  if (solicitud.pickupExpiresAt && solicitud.pickupExpiresAt.getTime() < ahora.getTime()) {
    return {
      valido: false,
      motivo: 'VENCIDO',
      mensaje: 'El código venció. Pide a tu supervisor que vuelva a aprobar la solicitud.',
    };
  }

  return { valido: true };
}

/** Horas que le quedan al código, redondeadas hacia abajo. `null` si no caduca. */
export function horasRestantesPickup(
  expiresAt: Date | null | undefined,
  ahora: Date,
): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.floor((expiresAt.getTime() - ahora.getTime()) / 3600_000));
}
