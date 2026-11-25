/**
 * Productividad del dia en tres ejes que no se compensan en silencio:
 * puntualidad (horario citado), aprovechamiento (actividades / laborados) y
 * eficiencia (estimado / real). El indice combinado usa pesos con vigencia.
 */

export type EjeProductividad = {
  /** 0..100 */
  pct: number;
  detalle: string;
};

export type ActividadEstimado = {
  activityId?: number;
  titulo?: string;
  /** Minutos reales en la actividad (reloj de sesion). */
  realMin: number;
  /** Minutos estimados / planeados (IA o estandar). */
  estimadoMin: number;
};

export type ProductividadDiaInput = {
  minutosLaborados: number;
  minutosProductivos: number;
  retardoMin: number;
  jornadaCitadaMin: number;
  actividades?: readonly ActividadEstimado[];
  pesos?: { puntualidad: number; aprovechamiento: number; eficiencia: number };
};

export type ProductividadDia = {
  puntualidad: EjeProductividad;
  aprovechamiento: EjeProductividad;
  eficiencia: EjeProductividad;
  /** Indice combinado 0..100 con los pesos. */
  indice: number;
  /** Ineficiencia media por atraso de actividades (0..1). */
  ineficienciaActividades: number;
  desglose: string;
  capas: {
    planeado: { jornadaCitadaMin: number };
    real: { minutosLaborados: number; minutosProductivos: number; retardoMin: number };
    pagable: { indice: number };
  };
};

const PESOS_DEFAULT = { puntualidad: 0.3, aprovechamiento: 0.4, eficiencia: 0.3 };

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Ineficiencia por actividad: exceso/estimado, tope 100 %.
 * Retorna promedio ponderado por estimado (0..1).
 */
export function ineficienciaPorEstimados(actividades: readonly ActividadEstimado[]): {
  media: number;
  pasadas: number;
  detalle: string;
} {
  const validas = actividades.filter((a) => a.estimadoMin > 0 && a.realMin >= 0);
  if (!validas.length) return { media: 0, pasadas: 0, detalle: 'Sin actividades con estimado' };
  let peso = 0;
  let acum = 0;
  let pasadas = 0;
  for (const a of validas) {
    const exceso = Math.max(0, a.realMin - a.estimadoMin);
    const inef = Math.min(1, exceso / a.estimadoMin);
    if (inef > 0) pasadas += 1;
    acum += inef * a.estimadoMin;
    peso += a.estimadoMin;
  }
  const media = peso > 0 ? acum / peso : 0;
  return {
    media,
    pasadas,
    detalle:
      pasadas === 0
        ? 'Ninguna actividad se paso de su estimado'
        : `${pasadas} actividad${pasadas === 1 ? '' : 'es'} se pasaron ${Math.round(media * 100)} % de su estimado`,
  };
}

export function productividadDia(p: ProductividadDiaInput): ProductividadDia {
  const pesos = p.pesos ?? PESOS_DEFAULT;
  const suma = Math.max(0.0001, pesos.puntualidad + pesos.aprovechamiento + pesos.eficiencia);
  const w = {
    puntualidad: pesos.puntualidad / suma,
    aprovechamiento: pesos.aprovechamiento / suma,
    eficiencia: pesos.eficiencia / suma,
  };

  // Puntualidad: retardo resta en proporcion a la jornada citada.
  let puntualidadPct = 100;
  if (p.jornadaCitadaMin > 0 && p.retardoMin > 0) {
    puntualidadPct = clampPct(100 * (1 - p.retardoMin / p.jornadaCitadaMin));
  }
  const puntualidad: EjeProductividad = {
    pct: puntualidadPct,
    detalle:
      p.retardoMin > 0
        ? `Retardo ${p.retardoMin} min sobre jornada citada de ${p.jornadaCitadaMin} min`
        : 'Sin retardo',
  };

  const aprovechamientoPct =
    p.minutosLaborados > 0 ? clampPct((100 * p.minutosProductivos) / p.minutosLaborados) : 0;
  const aprovechamiento: EjeProductividad = {
    pct: aprovechamientoPct,
    detalle: `Productivas ${fmtHm(p.minutosProductivos)} de ${fmtHm(p.minutosLaborados)} laboradas`,
  };

  const act = ineficienciaPorEstimados(p.actividades ?? []);
  const eficienciaPct = clampPct(100 * (1 - act.media));
  const eficiencia: EjeProductividad = {
    pct: eficienciaPct,
    detalle: act.detalle,
  };

  const indice = clampPct(
    puntualidad.pct * w.puntualidad +
      aprovechamiento.pct * w.aprovechamiento +
      eficiencia.pct * w.eficiencia,
  );

  const desglose = `Laboro ${fmtHm(p.minutosLaborados)} · productivas ${fmtHm(p.minutosProductivos)} (${aprovechamientoPct} %) · retardo ${p.retardoMin} min · ${act.detalle}`;

  return {
    puntualidad,
    aprovechamiento,
    eficiencia,
    indice,
    ineficienciaActividades: act.media,
    desglose,
    capas: {
      planeado: { jornadaCitadaMin: p.jornadaCitadaMin },
      real: {
        minutosLaborados: p.minutosLaborados,
        minutosProductivos: p.minutosProductivos,
        retardoMin: p.retardoMin,
      },
      pagable: { indice },
    },
  };
}

export function fmtHm(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h <= 0) return `${r} min`;
  if (r === 0) return `${h} h`;
  return `${h} h ${r.toString().padStart(2, '0')}`;
}