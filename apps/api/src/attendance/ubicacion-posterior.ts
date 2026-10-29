/**
 * Entrada sin ubicación que se completa con el primer punto del GPS de jornada.
 *
 * Adam (23-10-2026): Iván «siempre dice que no muestra su ubicación al iniciar jornada»; checa con
 * la ubicación del teléfono apagada o sin permiso y la entrada queda «Sin ubicación» aunque tres
 * minutos después el GPS de jornada ya mande puntos. Regla: si la entrada llegó sin coordenadas,
 * se le asigna el primer punto que llegue en los {@link VENTANA_UBICACION_POSTERIOR_MS} siguientes,
 * marcado como tomado después (`Attendance.ubicacionPosteriorAt`), en lugar de «Sin ubicación».
 *
 * El motivo lo dice con los minutos y conserva la causa original. Pasa a revisión solo si el punto
 * llegó después de {@link MARGEN_UBICACION_MIN}: Adam (28-10-2026) pidió «un margen de error de
 * 5–10 minutos por temas de internet» antes de marcar nada.
 */
import { combinarValidacion, type ValidacionChecada } from './asistencia-confiable.js';

/**
 * Margen de la ubicación: un punto que llegó a lo más estos minutos después de checar cuenta como
 * del momento, y un tramo con la ubicación apagada más corto no se marca (`estado-ubicacion.ts`).
 */
export const MARGEN_UBICACION_MIN = 10;

/** Cuánto después de checar todavía vale un punto como ubicación de la entrada. */
export const VENTANA_UBICACION_POSTERIOR_MS = 30 * 60_000;

/** Un punto medido un poco antes de checar (reloj del teléfono) también sirve. */
export const TOLERANCIA_ANTES_MS = 60_000;

/** ¿Este punto puede ser la ubicación de una entrada que llegó sin ella? */
export function puntoSirveParaEntrada(entradaAt: Date, puntoAt: Date): boolean {
  const diff = puntoAt.getTime() - entradaAt.getTime();
  return diff >= -TOLERANCIA_ANTES_MS && diff <= VENTANA_UBICACION_POSTERIOR_MS;
}

/** Minutos enteros entre la checada y el punto (0 si fue antes o en el mismo minuto). */
export function minutosDespues(entradaAt: Date, puntoAt: Date): number {
  return Math.max(0, Math.round((puntoAt.getTime() - entradaAt.getTime()) / 60_000));
}

/**
 * «Ubicación tomada 3 min después de checar (al checar: ubicación del teléfono apagada)».
 *
 * `motivoValidacion` puede juntar varios motivos con « · » («Sin ubicación: … · Registrada sin
 * conexión»): solo se cambia el de «Sin ubicación», con su causa; los demás se quedan.
 */
export function motivoUbicacionPosterior(minutos: number, motivoValidacion?: string | null): string {
  const cuando = minutos <= 0 ? 'al minuto de checar' : `${minutos} min después de checar`;
  const base = `Ubicación tomada ${cuando}`;
  const partes = String(motivoValidacion ?? '')
    .split(' · ')
    .map((p) => p.trim())
    .filter(Boolean);
  let reemplazado = false;
  const salida = partes.map((parte) => {
    if (!/^Sin ubicación\b/i.test(parte)) return parte;
    reemplazado = true;
    const causa = /^Sin ubicación:\s*(.+)$/i.exec(parte)?.[1]?.trim();
    return causa ? `${base} (al checar: ${causa})` : base;
  });
  if (!reemplazado) salida.unshift(base);
  return [...new Set(salida)].join(' · ');
}

/**
 * Validación de la entrada al ponerle su ubicación posterior. Dentro del margen, si la falta de
 * ubicación era lo único a revisar, queda OK; lo demás (sin conexión, hora del teléfono…) se queda.
 */
export function validacionTrasUbicacionPosterior(p: {
  minutos: number;
  validacion?: string | null;
  motivoValidacion?: string | null;
}): ValidacionChecada {
  const previa = (p.validacion as ValidacionChecada) || 'OK';
  if (p.minutos > MARGEN_UBICACION_MIN) return combinarValidacion(previa, 'REVISAR');
  const otros = String(p.motivoValidacion ?? '')
    .split(' · ')
    .map((parte) => parte.trim())
    .filter((parte) => parte && !/^(Sin ubicación|Ubicación tomada)\b/i.test(parte));
  return otros.length ? previa : 'OK';
}
