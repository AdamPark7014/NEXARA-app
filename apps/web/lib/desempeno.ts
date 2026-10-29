/**
 * Lectura de «Desempeño» como en el canvas (28-10): el índice de siempre (`cumplimientoPct`)
 * contado en cuatro pilares. Cada pilar agrupa partes que el sistema ya mide, con sus mismos
 * pesos, así que el índice no cambia; solo se lee mejor. La fórmula v2 (horas estándar ganadas)
 * sigue esperando las decisiones de §7.4 de `.ai/CUMPLIMIENTO-EVALUADOR-SPEC.md`.
 */
import type { ParteCumplimiento, TotalesKpi } from "@/lib/kpis-equipo";
import { horasEnPalabras } from "@/lib/kpis-lectura";

export type PilarId = "confiabilidad" | "calidad" | "rendimiento" | "disciplina";

export const PILARES: ReadonlyArray<{ id: PilarId; label: string; claves: readonly string[]; ayuda: string }> = [
  { id: "confiabilidad", label: "Confiabilidad", claves: ["entregas", "tiempo"], ayuda: "Entrega a tiempo y sin pasarse de su tiempo máximo" },
  { id: "calidad", label: "Calidad", claves: ["forma"], ayuda: "Entregas aprobadas a la primera" },
  { id: "rendimiento", label: "Rendimiento", claves: ["ritmo", "ocupacion"], ayuda: "Ritmo de entregas y tiempo con una actividad" },
  { id: "disciplina", label: "Disciplina", claves: ["asistencia", "uniforme"], ayuda: "Asistencia puntual y uniforme" },
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

/** Lo que multiplica el índice (carga de trabajo y días trabajados) cuando resta algo. */
export function multiplicadoresDe(partes: ParteCumplimiento[] | undefined): ParteCumplimiento[] {
  return (partes ?? []).filter((x) => x.peso === 0 && x.pct < 100);
}

export type Confianza = "alta" | "media" | "baja";

/** Qué tanto pesa el número: con pocas entregas medidas, un error mueve mucho el índice. */
export function confianzaDe(t: Pick<TotalesKpi, "entregas">): Confianza {
  const n = t.entregas?.medidas ?? 0;
  return n >= 15 ? "alta" : n >= 5 ? "media" : "baja";
}

export const CONFIANZA_UI: Record<Confianza, string> = {
  alta: "confianza alta",
  media: "confianza media",
  baja: "confianza baja",
};

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
