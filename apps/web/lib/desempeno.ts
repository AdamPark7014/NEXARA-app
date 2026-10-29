/**
 * Lectura de «Desempeño»: el índice v2 (§7.2 de `.ai/CUMPLIMIENTO-EVALUADOR-SPEC.md`, aprobado el 29-10)
 * contado en sus cuatro pilares. Cada pilar agrupa las partes que manda la API con su peso; ritmo,
 * ocupación, carga, tiempo adecuado y días trabajados llegan con peso 0, como diagnóstico.
 */
import type { ParteCumplimiento, TotalesKpi } from "@/lib/kpis-equipo";
import { horasEnPalabras } from "@/lib/kpis-lectura";

export type PilarId = "confiabilidad" | "calidad" | "rendimiento" | "disciplina";

export const PILARES: ReadonlyArray<{ id: PilarId; label: string; claves: readonly string[]; ayuda: string }> = [
  { id: "confiabilidad", label: "Confiabilidad", claves: ["entregas"], ayuda: "Entrega antes de su límite (en coordinación, su equipo y revisar a tiempo)" },
  { id: "calidad", label: "Calidad", claves: ["forma"], ayuda: "Aprobadas a la primera y su calificación calibrada" },
  { id: "rendimiento", label: "Rendimiento", claves: ["estandar"], ayuda: "Horas estándar ganadas contra sus horas en jornada" },
  { id: "disciplina", label: "Disciplina", claves: ["asistencia", "uniforme"], ayuda: "Puntualidad graduada, registro completo y uniforme" },
];

export type Pilar = { id: PilarId; label: string; ayuda: string; pct: number | null; partes: ParteCumplimiento[] };

/** Promedio ponderado (por su peso) de las partes de cada pilar; null si el pilar no tiene dato. */
export function pilaresDe(partes: ParteCumplimiento[] | undefined): Pilar[] {
  const lista = partes ?? [];
  return PILARES.map((p) => {
    const suyas = lista.filter((x) => p.claves.includes(x.clave) && x.peso > 0);
    const peso = suyas.reduce((a, x) => a + x.peso, 0);
    const pct = peso > 0 ? Math.round(suyas.reduce((a, x) => a + x.pct * x.peso, 0) / peso) : null;
    return { id: p.id, label: p.label, ayuda: p.ayuda, pct, partes: suyas };
  });
}

/** El diagnóstico (partes de peso 0) que vale la pena leer: lo que va por debajo de su referencia. */
export function diagnosticoDe(partes: ParteCumplimiento[] | undefined): ParteCumplimiento[] {
  return (partes ?? []).filter((x) => x.peso === 0 && x.pct < 100);
}

export type Confianza = "alta" | "media" | "baja";

/** §7.2: con 20 entregas medidas o más es alta; de 10 a 19, media; con menos, baja y no se publica. */
export function confianzaDe(t: Pick<TotalesKpi, "entregas" | "confianza">): Confianza {
  // La API ya la manda (la misma para web y apps); si no viene, la misma regla aquí.
  if (t.confianza) return t.confianza;
  const n = t.entregas?.medidas ?? 0;
  return n >= 20 ? "alta" : n >= 10 ? "media" : "baja";
}

export const CONFIANZA_UI: Record<Confianza, string> = {
  alta: "confianza alta",
  media: "confianza media",
  baja: "confianza baja",
};

/**
 * Horas estándar ganadas: lo que vale lo entregado (tiempo estándar; lo autoasignado sin validar, la
 * mitad) contra sus horas en jornada, y qué tan cerca del estándar lo hizo. Es el pilar Rendimiento.
 * null si en el rango no entregó nada con tiempo estándar.
 */
export function estandarGanado(t: Pick<TotalesKpi, "entregas" | "minutosLaborados">): { valor: string; detalle: string } | null {
  const e = t.entregas;
  const n = e?.conEstandar ?? 0;
  const ganados = e?.minutosEstandarGanados ?? 0;
  if (!e || n <= 0 || ganados <= 0) return null;
  const rendimiento = t.minutosLaborados > 0 ? Math.round((ganados / t.minutosLaborados) * 100) : null;
  const partes = [`${n} ${n === 1 ? "entrega" : "entregas"} con estándar`];
  if (e.pctEficienciaEstandar != null) partes.push(`eficiencia ${e.pctEficienciaEstandar} %`);
  return {
    valor: rendimiento != null ? `${horasEnPalabras(ganados)} · ${rendimiento} % de su jornada` : horasEnPalabras(ganados),
    detalle: partes.join(" · "),
  };
}

/** Puntualidad graduada y registro completo, en una línea. null sin días que medir. */
export function disciplinaTexto(t: Pick<TotalesKpi, "disciplina">): string | null {
  const d = t.disciplina;
  if (!d || !d.esperados) return null;
  const partes = [`${d.puntos} de ${d.esperados} días en puntos`];
  if (d.faltasPorRetardos) {
    partes.push(`${d.retardos} retardos = ${d.faltasPorRetardos} ${d.faltasPorRetardos === 1 ? "falta" : "faltas"} (no se descuenta sola)`);
  }
  if (d.jornadasRevisables) partes.push(`registro completo ${d.registroCompleto} de ${d.jornadasRevisables}`);
  return partes.join(" · ");
}

/** «Entregó 31 de 33 a tiempo. Tuvo una actividad corriendo 128 h de 212 h en jornada.» */
export function resumenDesempeno(t: TotalesKpi): string {
  const frases: string[] = [];
  const e = t.entregas;
  if (e && e.medidas > 0) {
    frases.push(
      `Entregó ${e.aTiempo} de ${e.medidas} a tiempo${e.sinEntregar ? ` y ${e.sinEntregar} ${e.sinEntregar === 1 ? "quedó" : "quedaron"} sin entregar` : ""}.`,
    );
  } else {
    frases.push("No tuvo entregas que medir en estas fechas.");
  }
  if (t.minutosLaborados > 0) {
    frases.push(
      `Tuvo una actividad corriendo ${horasEnPalabras(t.minutosProductivos)} de ${horasEnPalabras(t.minutosLaborados)} en jornada.`,
    );
  }
  return frases.join(" ");
}
