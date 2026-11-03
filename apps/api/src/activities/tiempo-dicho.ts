/**
 * Cuánto tomó de verdad, dicho por quien la ejecutó (Velocidad Core, Ola 4).
 *
 * El reloj sigue siendo el reloj: nómina, KPIs y semáforo no leen esto. Solo enseña a los tiempos
 * (`aprendizaje-tiempos.ts`), porque 2 de cada 3 relojes corren hasta que acaba el día y entonces no
 * dicen cuánto duró el trabajo. Se pregunta una vez y se puede ignorar.
 *
 * Puro, con pruebas.
 */

/** Pasado esto ya nadie se acuerda: mejor sin dato que con uno inventado. */
export const DIAS_PARA_DECIR = 7;
/** 100 h: de ahí en adelante es un error de captura. */
export const MINUTOS_MAX_DICHOS = 6000;
/** Un reloj de 2 h o más casi siempre es de jornada completa: vale la pena confirmarlo. */
const RELOJ_QUE_SE_CONFIRMA_MIN = 120;

export type EstadoParaDecir = {
  estatus?: string | null;
  periodoInicio?: string | Date | null;
  periodoFin?: string | Date | null;
  /** Cuando se terminó; sin dato, cuenta como recién terminada. */
  terminadaEn?: Date | null;
  ahora: Date;
};

/** Cuándo paró el último reloj; null si no hay o sigue corriendo alguno. */
export function finDeSesiones(sesiones: Array<{ endedAt: Date | null }>): Date | null {
  if (!sesiones.length || sesiones.some((s) => !s.endedAt)) return null;
  return new Date(Math.max(...sesiones.map((s) => (s.endedAt as Date).getTime())));
}

/** Por qué no se puede decir ahora; null si sí se puede. */
export function motivoParaNoDecir(a: EstadoParaDecir): string | null {
  if (a.estatus !== 'Finalizada' && a.estatus !== 'Por Validar') return 'Se dice al terminar la actividad.';
  if (a.periodoInicio && a.periodoFin) return 'Una actividad de varios días no se corrige aquí.';
  if (a.terminadaEn && a.ahora.getTime() - a.terminadaEn.getTime() > DIAS_PARA_DECIR * 86_400_000) {
    return `Ya pasaron más de ${DIAS_PARA_DECIR} días desde que se terminó.`;
  }
  return null;
}

/**
 * ¿Se le pregunta? Terminada, sin respuesta y con reloj; y solo si importa: un reloj largo o uno que
 * se aleja más de la mitad de lo planeado.
 */
export function debePreguntarTiempo(a: EstadoParaDecir & { dichoMin?: number | null; relojMin?: number | null; planMin?: number | null }): boolean {
  if (a.dichoMin != null || motivoParaNoDecir(a)) return false;
  const reloj = a.relojMin ?? 0;
  if (reloj < 5) return false;
  if (reloj >= RELOJ_QUE_SE_CONFIRMA_MIN) return true;
  return a.planMin != null && a.planMin > 0 && (reloj < a.planMin * 0.5 || reloj > a.planMin * 1.5);
}
