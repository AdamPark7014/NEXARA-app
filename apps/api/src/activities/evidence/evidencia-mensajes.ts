/**
 * Textos de rechazo de la captura de evidencias: cada uno dice qué pasó y qué hacer después.
 *
 * Por qué existe: en nueve semanas de producción la mitad de los rechazos fueron la misma persona chocando tres o
 * más veces el mismo día con el mismo mensaje, porque el servidor decía «no» sin decir qué seguía. El código HTTP
 * de cada rechazo NO cambia; solo el texto, más un `code` estable para que las apps puedan reaccionar sin leer texto.
 *
 * Funciones puras: sin Nest ni Prisma. Ningún texto lleva folios ni datos de personas.
 */

export const CODIGOS_EVIDENCIA = {
  EVIDENCIA_EN_REVISION: 'EVIDENCIA_EN_REVISION',
  EVIDENCIA_APROBADA: 'EVIDENCIA_APROBADA',
  ACTIVIDAD_APROBADA: 'ACTIVIDAD_APROBADA',
  ACTIVIDAD_CANCELADA: 'ACTIVIDAD_CANCELADA',
  ACTIVIDAD_NO_CUMPLIDA: 'ACTIVIDAD_NO_CUMPLIDA',
  FOTO_ENTRADA_YA_GUARDADA: 'FOTO_ENTRADA_YA_GUARDADA',
  PASO_INCORRECTO: 'PASO_INCORRECTO',
} as const;

export type CodigoEvidencia = (typeof CODIGOS_EVIDENCIA)[keyof typeof CODIGOS_EVIDENCIA];

/** Cuerpo de una excepción de Nest: el filtro global reenvía `code` al cliente tal cual. */
export type RechazoEvidencia = { message: string; code: CodigoEvidencia };

/** Pasos de la captura, en su orden. `COMPLETED` va aparte: ya no es un paso, es «enviada». */
export const PASOS_EVIDENCIA = [
  'ENTRY_PHOTO',
  'EVIDENCE_PHOTOS',
  'SERVICE_SHEET_PDF',
  'SERVICE_SHEET_DATA',
  'EXIT_PHOTO',
] as const;

export type PasoEvidencia = (typeof PASOS_EVIDENCIA)[number];

const EN_REVISION = 'Tu evidencia ya está en revisión.';

const SIGUE_CON: Record<PasoEvidencia, string> = {
  ENTRY_PHOTO: 'Sigue con la foto de entrada.',
  EVIDENCE_PHOTOS: 'Sigue con las fotos de evidencia.',
  SERVICE_SHEET_PDF: 'Sigue con la hoja de servicio.',
  SERVICE_SHEET_DATA: 'Sigue con el formulario.',
  EXIT_PHOTO: 'Sigue con la foto de salida.',
};

const PRIMERO: Record<PasoEvidencia, string> = {
  ENTRY_PHOTO: 'toma la foto de entrada',
  EVIDENCE_PHOTOS: 'sube las fotos de evidencia',
  SERVICE_SHEET_PDF: 'carga la hoja de servicio',
  SERVICE_SHEET_DATA: 'llena el formulario',
  EXIT_PHOTO: 'toma la foto de salida',
};

function esPaso(valor: unknown): valor is PasoEvidencia {
  return typeof valor === 'string' && (PASOS_EVIDENCIA as readonly string[]).includes(valor);
}

/** Qué sigue según el punto en que va la evidencia. Un valor desconocido no inventa un paso. */
export function siguientePaso(statusActual: string | null | undefined): string {
  if (statusActual === 'COMPLETED') return EN_REVISION;
  return esPaso(statusActual) ? SIGUE_CON[statusActual] : 'Abre la actividad otra vez para ver en qué paso vas.';
}

export const MENSAJE_EVIDENCIA_EN_REVISION =
  'Tu evidencia ya se envió y está en revisión, así que no hace falta mandarla otra vez. Si falta algo, tu jefe te la devuelve y la corriges.';

export const MENSAJE_FOTO_EN_REVISION =
  'Esa foto ya está en revisión y no se puede cambiar ni quitar. Si falta algo, tu jefe te la devuelve.';

export const MENSAJE_EVIDENCIA_APROBADA =
  'Tu evidencia ya fue aprobada y no se puede cambiar. Si ves un error, avísale a tu jefe.';

export const MENSAJE_ACTIVIDAD_APROBADA =
  'Esta actividad ya fue aprobada y no recibe más evidencias. Si ves un error, avísale a tu jefe.';

export const MENSAJE_ACTIVIDAD_CANCELADA =
  'Esta actividad fue cancelada y ya no recibe evidencias. Si crees que es un error, avísale a tu jefe.';

export const MENSAJE_ACTIVIDAD_NO_CUMPLIDA =
  'Esta actividad quedó como «No cumplida» y ya no recibe evidencias. Pídele a tu jefe que la reprograme y entonces la terminas.';

export function rechazoEvidenciaEnRevision(): RechazoEvidencia {
  return { message: MENSAJE_EVIDENCIA_EN_REVISION, code: CODIGOS_EVIDENCIA.EVIDENCIA_EN_REVISION };
}

export function rechazoFotoEnRevision(): RechazoEvidencia {
  return { message: MENSAJE_FOTO_EN_REVISION, code: CODIGOS_EVIDENCIA.EVIDENCIA_EN_REVISION };
}

export function rechazoEvidenciaAprobada(): RechazoEvidencia {
  return { message: MENSAJE_EVIDENCIA_APROBADA, code: CODIGOS_EVIDENCIA.EVIDENCIA_APROBADA };
}

export function rechazoActividadAprobada(): RechazoEvidencia {
  return { message: MENSAJE_ACTIVIDAD_APROBADA, code: CODIGOS_EVIDENCIA.ACTIVIDAD_APROBADA };
}

export function rechazoActividadCancelada(): RechazoEvidencia {
  return { message: MENSAJE_ACTIVIDAD_CANCELADA, code: CODIGOS_EVIDENCIA.ACTIVIDAD_CANCELADA };
}

export function rechazoActividadNoCumplida(): RechazoEvidencia {
  return { message: MENSAJE_ACTIVIDAD_NO_CUMPLIDA, code: CODIGOS_EVIDENCIA.ACTIVIDAD_NO_CUMPLIDA };
}

/** La foto de entrada ya estaba: se dice y se manda al paso en que de verdad va la persona. */
export function rechazoFotoEntradaYaGuardada(statusActual: string | null | undefined): RechazoEvidencia {
  const sigue = statusActual === 'ENTRY_PHOTO' ? '' : ` ${siguientePaso(statusActual)}`;
  return {
    message: `Tu foto de entrada ya quedó guardada.${sigue}`,
    code: CODIGOS_EVIDENCIA.FOTO_ENTRADA_YA_GUARDADA,
  };
}

/**
 * La persona mandó un paso que no es en el que va.
 * - Si va ANTES de ese paso: le falta algo previo, se le dice qué.
 * - Si va DESPUÉS (o ya envió todo): ese paso ya se guardó, se le dice qué sigue.
 */
export function mensajePasoIncorrecto(pasoQueManda: PasoEvidencia, statusActual: string | null | undefined): string {
  if (statusActual === 'COMPLETED') {
    return `Este paso ya se envió. ${EN_REVISION}`;
  }
  if (!esPaso(statusActual)) {
    return 'Todavía no toca este paso. Abre la actividad otra vez para ver en qué paso vas.';
  }
  const actual = PASOS_EVIDENCIA.indexOf(statusActual);
  const mandado = PASOS_EVIDENCIA.indexOf(pasoQueManda);
  if (actual < mandado) {
    return `Todavía no toca este paso. Primero ${PRIMERO[statusActual]}.`;
  }
  return `Este paso ya se envió. ${SIGUE_CON[statusActual]} Si te faltó algo, regresa a ese paso y vuelve a mandarlo.`;
}

export function rechazoPasoIncorrecto(
  pasoQueManda: PasoEvidencia,
  statusActual: string | null | undefined,
): RechazoEvidencia {
  return { message: mensajePasoIncorrecto(pasoQueManda, statusActual), code: CODIGOS_EVIDENCIA.PASO_INCORRECTO };
}
