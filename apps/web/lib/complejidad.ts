import { erpFetch } from "@/lib/erp-api";
import { formatoMinutos } from "@/lib/actividad-tiempos";

/**
 * Complejidad al asignar y el tiempo típico del tipo de trabajo (API `ai/complejidad/*`).
 * La IA sugiere un nivel; quien asigna decide y las dos quedan guardadas en la actividad.
 */
export const COMPLEJIDADES = ["BASICA", "ESTANDAR", "COMPLEJA", "CRITICA"] as const;
export type Complejidad = (typeof COMPLEJIDADES)[number];

export const COMPLEJIDAD_UI: Record<Complejidad, { label: string; ayuda: string }> = {
  BASICA: { label: "Básica", ayuda: "Rutina corta" },
  ESTANDAR: { label: "Estándar", ayuda: "Lo normal" },
  COMPLEJA: { label: "Compleja", ayuda: "Más volumen" },
  CRITICA: { label: "Crítica", ayuda: "Cliente detenido" },
};

export function esComplejidad(v: unknown): v is Complejidad {
  return typeof v === "string" && (COMPLEJIDADES as readonly string[]).includes(v);
}

export type Tipico = { muestras: number; medianaMin: number | null };
export type TiemposTipicos = { clave: string | null; total: Tipico; porComplejidad: Record<Complejidad, Tipico> };
export type SugerenciaComplejidad = {
  complejidad: Complejidad;
  motivo: string;
  /** Lo que se cuenta en ese tipo, si el título lo dice («50 productos» → 50). Para el tiempo estándar. */
  cantidad?: number | null;
  /** El lugar al que hay que ir, si el texto lo nombra. */
  destino?: string | null;
};

export function fetchTiemposTipicos(token: string, q: { coreKind: string; tipo?: string | null }): Promise<TiemposTipicos> {
  const p = new URLSearchParams({ coreKind: q.coreKind });
  if (q.tipo) p.set("tipo", q.tipo);
  return erpFetch<TiemposTipicos>(`ai/complejidad/tiempos?${p.toString()}`, token);
}

export function sugerirComplejidad(
  token: string,
  body: { coreKind: string; tipo?: string | null; titulo: string; indicaciones?: string | null },
): Promise<{ sugerencia: SugerenciaComplejidad | null }> {
  return erpFetch(`ai/complejidad/sugerir`, token, {
    method: "POST",
    body: JSON.stringify({
      coreKind: body.coreKind,
      tipo: body.tipo || undefined,
      titulo: body.titulo,
      indicaciones: body.indicaciones || undefined,
    }),
  });
}

/**
 * Lo típico para la complejidad elegida; si ese nivel aún no junta 3 anteriores, el del tipo
 * completo (y se dice).
 */
export function tipicoPara(
  t: TiemposTipicos | null | undefined,
  c: Complejidad | "" | null | undefined,
): { minutos: number; muestras: number; delNivel: boolean } | null {
  if (!t) return null;
  const nivel = c && esComplejidad(c) ? t.porComplejidad[c] : null;
  if (nivel?.medianaMin != null) return { minutos: nivel.medianaMin, muestras: nivel.muestras, delNivel: true };
  if (t.total.medianaMin != null) return { minutos: t.total.medianaMin, muestras: t.total.muestras, delNivel: false };
  return null;
}

/** «Lo típico en Instalación · Compleja: 3 h 40 min (9 anteriores).» */
export function textoTipico(
  tipoLabel: string,
  c: Complejidad | "" | null | undefined,
  tipico: ReturnType<typeof tipicoPara>,
): string | null {
  if (!tipico) return null;
  const nivel = tipico.delNivel && c && esComplejidad(c) ? ` · ${COMPLEJIDAD_UI[c].label}` : "";
  const cuantas = `${tipico.muestras} anterior${tipico.muestras === 1 ? "" : "es"}`;
  return `Lo típico en ${tipoLabel}${nivel}: ${formatoMinutos(tipico.minutos)} (${cuantas}).`;
}
