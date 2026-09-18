/**
 * Periodo de una actividad en la web: del día de inicio al día de fin (ambos incluidos).
 *
 * La etiqueta que se ve en la pizarra («Día 3 de 10 · termina vie 25 sep») la calcula la
 * API (`apps/api/src/activities/actividad-periodo.ts`) con el «hoy» de México; aquí solo se
 * pinta. Lo de este archivo es para capturar: el resumen del rango mientras se elige y el
 * encadenado de etapas al programar un proyecto.
 *
 * Los días viajan como `AAAA-MM-DD`; se reutiliza la aritmética de `proyecto-plan.ts`.
 */
import { diaDe, diasEntre, isoDeDia, sumarDias } from "@/lib/proyecto-plan";

export type EstadoPeriodo = "programada" | "en_curso" | "vencida" | "cerrada";

/** Lo que manda la API con cada actividad que tiene periodo. */
export type PeriodoActividad = {
  inicio: string;
  fin: string;
  dias: number;
  dia: number | null;
  estado: EstadoPeriodo;
  etiqueta: string;
  multiDia: boolean;
};

export type RangoDias = { inicio: string; fin: string };

const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «vie 25 sep», igual que la API. */
export function fechaCorta(iso: string): string {
  const n = diaDe(iso);
  if (n === null) return iso;
  const d = new Date(n * 86_400_000);
  return `${DIAS_SEMANA[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

/** Días del rango contando los dos extremos; null si falta algo o va al revés. */
export function diasDelRango(r: Partial<RangoDias>): number | null {
  const d = diasEntre(r.inicio ?? null, r.fin ?? null);
  return d === null || d < 0 ? null : d + 1;
}

/** Texto bajo el selector de rango: «10 días · del mié 16 sep al vie 25 sep». */
export function resumenDelRango(r: Partial<RangoDias>): string | null {
  if (!r.inicio || !r.fin) return null;
  const dias = diasDelRango(r);
  if (dias === null) return "El día de fin no puede ser anterior al de inicio";
  if (dias === 1) return `Un solo día · ${fechaCorta(r.inicio)}`;
  return `${dias} días · del ${fechaCorta(r.inicio)} al ${fechaCorta(r.fin)}`;
}

/** ¿Comparten al menos un día? */
export function rangosSeEmpalman(a: RangoDias, b: RangoDias): boolean {
  return a.inicio <= b.fin && a.fin >= b.inicio;
}

/**
 * Encadenado al editar la programación: cada etapa incluida empieza el día siguiente a
 * que termina la anterior incluida y conserva su duración. Se corre a partir de `desde`
 * (la que se acaba de mover); las anteriores no se tocan. Las no incluidas no empujan.
 */
export function reencadenar<T extends RangoDias & { incluir?: boolean }>(filas: T[], desde: number): T[] {
  const salida = filas.map((f) => ({ ...f }));
  let anterior: T | null = null;
  for (let i = 0; i < salida.length; i++) {
    const fila = salida[i];
    if (fila.incluir === false) continue;
    if (i > desde && anterior) {
      const dias = diasDelRango(fila) ?? 1;
      const inicio = sumarDias(anterior.fin, 1);
      fila.inicio = inicio;
      fila.fin = sumarDias(inicio, dias - 1);
    }
    anterior = fila;
  }
  return salida;
}

/**
 * Periodo por omisión al asignar una actividad de proyecto: la etapa que corre hoy (o la
 * siguiente por empezar); sin etapas, la ventana del proyecto desde hoy. El inicio nunca
 * cae antes de hoy: lo que ya pasó no se asigna.
 */
export function periodoPorOmision(
  etapas: Array<RangoDias & { hitoId: number }>,
  proyecto: { inicio?: string | null; fin?: string | null },
  hoy: string,
): (RangoDias & { hitoId: number | null }) | null {
  const recorta = (r: RangoDias) => ({ inicio: r.inicio < hoy ? hoy : r.inicio, fin: r.fin < hoy ? hoy : r.fin });
  const vigente = etapas.find((e) => e.fin >= hoy);
  if (vigente) return { ...recorta(vigente), hitoId: vigente.hitoId };
  const inicio = proyecto.inicio ? aDia(proyecto.inicio) : null;
  const fin = proyecto.fin ? aDia(proyecto.fin) : null;
  if (!inicio && !fin) return null;
  const r = recorta({ inicio: inicio ?? hoy, fin: fin && fin >= (inicio ?? hoy) ? fin : (inicio ?? hoy) });
  return { ...r, hitoId: null };
}

function aDia(valor: string): string | null {
  const n = diaDe(valor);
  return n === null ? null : isoDeDia(n);
}
