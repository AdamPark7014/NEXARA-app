/**
 * Complejidad de una actividad y su tiempo típico.
 *
 * Al asignar se elige la complejidad (Básica, Estándar, Compleja, Crítica) y la web enseña,
 * para ese tipo de trabajo, cuánto tardaron de verdad las anteriores: la mediana del reloj de
 * cada persona en las actividades terminadas. Es la base del «tiempo estándar» de la fórmula v2
 * de desempeño (`.ai/CUMPLIMIENTO-EVALUADOR-SPEC.md` §7).
 *
 * Puro: la consulta vive en `complejidad.service.ts`.
 */
import { SUBTIPOS_TAREA } from '../asistente/asistente-actividades.js';

export const COMPLEJIDADES = ['BASICA', 'ESTANDAR', 'COMPLEJA', 'CRITICA'] as const;
export type Complejidad = (typeof COMPLEJIDADES)[number];

export const ETIQUETA_COMPLEJIDAD: Record<Complejidad, string> = {
  BASICA: 'Básica',
  ESTANDAR: 'Estándar',
  COMPLEJA: 'Compleja',
  CRITICA: 'Crítica',
};

export function esComplejidad(v: unknown): v is Complejidad {
  return typeof v === 'string' && (COMPLEJIDADES as readonly string[]).includes(v);
}

/** Menos de esto no es «lo típico»: con 1 o 2 anteriores no se enseña mediana. */
export const MUESTRAS_MINIMAS = 3;

/** Sin acentos, sin mayúsculas, sin puntuación al final y con los espacios colapsados. */
export function normalizar(valor: string | null | undefined): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[.\s]+$/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

const SUBTIPO_POR_NORMA = new Map(SUBTIPOS_TAREA.map((s) => [normalizar(s), s]));

/**
 * Textos libres de antes del catálogo cerrado (28-10) que sí son un tipo del catálogo. Se
 * comparan por el inicio: «instalación de tubería» cuenta como Instalación.
 */
const SINONIMOS_TAREA: Array<[string, (typeof SUBTIPOS_TAREA)[number]]> = [
  ['instalacion cableado', 'Cableado y canalización'],
  ['instalacion de tuberia', 'Cableado y canalización'],
  ['instalacion', 'Instalación'],
  ['instalar', 'Instalación'],
  ['cableado', 'Cableado y canalización'],
  ['nodo', 'Cableado y canalización'],
  ['mantenimiento', 'Mantenimiento preventivo'],
  ['diagnostico', 'Correctivo y diagnóstico'],
  ['correctivo', 'Correctivo y diagnóstico'],
  ['dibujo', 'Diseño, CAD y memoria técnica'],
  ['diseno', 'Diseño, CAD y memoria técnica'],
  ['memoria tecnica', 'Diseño, CAD y memoria técnica'],
  ['configuracion', 'Configuración y soporte remoto'],
  ['curso', 'Capacitación'],
  ['continuacion de curso', 'Capacitación'],
  ['reporte', 'Reporte / documentación'],
  ['documentacion', 'Reporte / documentación'],
  ['guardia', 'Evento o guardia'],
  ['exposicion', 'Evento o guardia'],
  ['factura', 'Facturación y contabilidad'],
  ['elaboracion de facturas', 'Facturación y contabilidad'],
];

/** El tipo de tarea del catálogo para un texto (etiqueta del chip o texto libre viejo); null si no es ninguno. */
export function subtipoDeTarea(texto: string | null | undefined): string | null {
  const n = normalizar(texto);
  if (!n) return null;
  const exacto = SUBTIPO_POR_NORMA.get(n);
  if (exacto) return exacto;
  for (const [inicio, subtipo] of SINONIMOS_TAREA) if (n === inicio || n.startsWith(`${inicio} `)) return subtipo;
  return null;
}

/**
 * Clave del «tipo de trabajo»: en tarea, su subtipo del catálogo; en servicio, el tipo de
 * ticket; en las demás, el tipo Core solo. null si no se puede saber (tarea con texto libre
 * que no es del catálogo).
 */
export function claveDeTipo(a: {
  coreKind?: string | null;
  ticketType?: string | null;
  ticketTypeCustom?: string | null;
}): string | null {
  const kind = (a.coreKind ?? '').trim().toLowerCase();
  if (!kind) return null;
  if (kind === 'tarea') {
    const subtipo = subtipoDeTarea(a.ticketTypeCustom);
    return subtipo ? `tarea:${subtipo}` : null;
  }
  if (kind === 'servicio') return `servicio:${(a.ticketType ?? 'PREVENTIVO').toUpperCase()}`;
  return kind;
}

export function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

export type Tipico = { muestras: number; medianaMin: number | null };

export type TiemposTipicos = {
  /** Todas las anteriores de ese tipo, sin importar la complejidad. */
  total: Tipico;
  porComplejidad: Record<Complejidad, Tipico>;
};

/** Minutos de reloj de una persona en una actividad terminada. */
export type FilaTiempo = {
  coreKind: string | null;
  ticketType: string | null;
  ticketTypeCustom: string | null;
  complejidad: string | null;
  minutos: number;
};

function tipico(minutos: number[]): Tipico {
  // Redondeado a 5 min: es lo que mueve la rueda del formulario.
  const m = minutos.length >= MUESTRAS_MINIMAS ? mediana(minutos) : null;
  return { muestras: minutos.length, medianaMin: m == null ? null : Math.max(5, Math.round(m / 5) * 5) };
}

/** Agrupa por tipo de trabajo y complejidad. */
export function agruparTiempos(filas: FilaTiempo[]): Map<string, TiemposTipicos> {
  const crudo = new Map<string, { total: number[]; por: Record<Complejidad, number[]> }>();
  for (const f of filas) {
    const clave = claveDeTipo(f);
    if (!clave || !(f.minutos > 0)) continue;
    let g = crudo.get(clave);
    if (!g) {
      g = { total: [], por: { BASICA: [], ESTANDAR: [], COMPLEJA: [], CRITICA: [] } };
      crudo.set(clave, g);
    }
    g.total.push(f.minutos);
    if (esComplejidad(f.complejidad)) g.por[f.complejidad].push(f.minutos);
  }
  const salida = new Map<string, TiemposTipicos>();
  for (const [clave, g] of crudo) {
    salida.set(clave, {
      total: tipico(g.total),
      porComplejidad: {
        BASICA: tipico(g.por.BASICA),
        ESTANDAR: tipico(g.por.ESTANDAR),
        COMPLEJA: tipico(g.por.COMPLEJA),
        CRITICA: tipico(g.por.CRITICA),
      },
    });
  }
  return salida;
}

export const SIN_TIEMPOS: TiemposTipicos = {
  total: { muestras: 0, medianaMin: null },
  porComplejidad: {
    BASICA: { muestras: 0, medianaMin: null },
    ESTANDAR: { muestras: 0, medianaMin: null },
    COMPLEJA: { muestras: 0, medianaMin: null },
    CRITICA: { muestras: 0, medianaMin: null },
  },
};
