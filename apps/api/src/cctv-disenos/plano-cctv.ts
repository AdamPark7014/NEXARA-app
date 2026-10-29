/**
 * Reglas del contenido de un diseño de videovigilancia: lo que la API exige antes de guardar.
 *
 * El plano lo arma y lo interpreta la web (`apps/web/lib/cctv/plano.ts`); aquí solo se cuida que
 * tenga la forma de la versión 1 y que no crezca sin límite (cada guardado lo manda completo).
 */
import { BadRequestException } from '@nestjs/common';

export const ESTADOS_DISENO = ['borrador', 'enviada', 'aprobada'] as const;
export type EstadoDiseno = (typeof ESTADOS_DISENO)[number];

export const NOMBRE_DISENO_MAX = 160;

/** Tope del plano serializado (caracteres de `JSON.stringify`). */
export const PLANO_MAX_CARACTERES = 2_000_000;
/** La grabación (NVR, discos, días) y el resumen de la lista son chicos. */
export const GRABACION_MAX_CARACTERES = 200_000;
export const RESUMEN_MAX_CARACTERES = 10_000;

/** Las listas que todo plano versión 1 trae, aunque estén vacías. */
export const LISTAS_PLANO = [
  'muros',
  'aberturas',
  'obstaculos',
  'etiquetas',
  'cotas',
  'camaras',
  'personas',
] as const;

/** Plano de un diseño nuevo: sin croquis, a 2 cm por píxel y con el norte hacia arriba. */
export function planoVacio() {
  return {
    version: 1,
    croquis: null,
    escala: { metrosPorPx: 0.02, calibracion: null },
    norteDeg: 0,
    muros: [],
    aberturas: [],
    obstaculos: [],
    etiquetas: [],
    cotas: [],
    camaras: [],
    personas: [],
  };
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return valor != null && typeof valor === 'object' && !Array.isArray(valor);
}

function caracteres(valor: unknown): number {
  try {
    return JSON.stringify(valor)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Lanza 400 si el plano no es un objeto versión 1 con sus listas, o si pasa del tope. */
export function validarPlano(plano: unknown): Record<string, unknown> {
  if (!esObjeto(plano)) {
    throw new BadRequestException('El plano no tiene el formato esperado.');
  }
  if (caracteres(plano) > PLANO_MAX_CARACTERES) {
    throw new BadRequestException('El plano es demasiado grande.');
  }
  if (plano['version'] !== 1) {
    throw new BadRequestException('El plano no tiene el formato esperado (versión 1).');
  }
  const faltan = LISTAS_PLANO.filter((lista) => !Array.isArray(plano[lista]));
  if (faltan.length > 0) {
    throw new BadRequestException(`Al plano le faltan listas: ${faltan.join(', ')}.`);
  }
  return plano;
}

/** Grabación o resumen: un objeto, o `null` para quitarlo. */
export function validarExtra(
  valor: unknown,
  que: 'grabacion' | 'resumen',
): Record<string, unknown> | null {
  if (valor === null) return null;
  const etiqueta = que === 'grabacion' ? 'La grabación' : 'El resumen';
  if (!esObjeto(valor)) {
    throw new BadRequestException(`${etiqueta} no tiene el formato esperado.`);
  }
  const tope = que === 'grabacion' ? GRABACION_MAX_CARACTERES : RESUMEN_MAX_CARACTERES;
  if (caracteres(valor) > tope) {
    throw new BadRequestException(`${etiqueta} es demasiado grande.`);
  }
  return valor;
}

/** Nombre sin espacios sobrantes; vacío no se acepta. */
export function nombreDiseno(nombre: unknown): string {
  const limpio = String(nombre ?? '').replace(/\s+/g, ' ').trim();
  if (!limpio) throw new BadRequestException('Escribe un nombre para el diseño.');
  if (limpio.length > NOMBRE_DISENO_MAX) {
    throw new BadRequestException(`El nombre no puede pasar de ${NOMBRE_DISENO_MAX} caracteres.`);
  }
  return limpio;
}
