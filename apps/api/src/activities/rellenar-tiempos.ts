/**
 * Relleno de una sola vez (29-10-2026) de las actividades abiertas que quedaron sin tiempo estándar,
 * sin tiempo estimado o sin entrega, con las reglas de `tiempo-entrega.ts`. Idempotente: solo llena
 * lo que está vacío y nunca borra. Lo corre `scripts/rellenar-tiempos-abiertas.cjs` dentro del
 * contenedor de la API (simulacro por omisión; `--escribir` para guardar).
 *
 * Decisión del 29-10 (opción B): ponerle estándar de golpe a trabajo ya entregado castigaría a la
 * gente por un error de tipo (tubería como «Preparación de equipo» = 15 min). Por eso:
 * - En proceso: completas desde el título (con el tipo corregido si el título dice otro trabajo).
 * - Ya entregadas: sin estándar; su tiempo estimado es la mediana real de su tipo y queda marcado
 *   (`MOTIVO_RELLENO`) para que el desempeño no lo use como plan.
 * - La entrega de las que no tenían: el fin del día de su inicio (o de su asignación); si ya se
 *   entregó después de ese día, el fin del día en que se entregó (no cambia su «a tiempo»).
 */
import { workDayEnd } from '../common/time/workday.js';
import { reglaDe } from '../ai/estandar/tabla-estandar.js';
import { normalizar } from '../ai/complejidad/tiempos-tipicos.js';
import type { EstandarCalculado } from './tiempo-entrega.js';

export const ESTATUS_CERRADOS = ['Finalizada', 'Cancelada', 'No cumplida', 'Completada', 'Cerrada'];

/** El tiempo estimado que se rellenó en lo ya entregado no es un plan: el desempeño no lo usa. */
export const MOTIVO_RELLENO = 'relleno 29-10 tras entrega';

export type FilaAbierta = {
  id: number;
  anNumber: string;
  titulo: string;
  indicaciones?: string | null;
  estatus: string;
  coreKind?: string | null;
  ticketType?: string | null;
  ticketTypeCustom?: string | null;
  creadoPorId: number;
  responsableId: number;
  tiempoEstimadoMin: number | null;
  tiempoEstandarMin: number | null;
  complejidad: string | null;
  complejidadSugerida: string | null;
  unidades: unknown;
  fechaInicio: Date | null;
  fechaAsignacion: Date | null;
  fechaEntregaEsperada: Date | null;
  fechaMaxima: Date | null;
  periodoFin: Date | null;
  /** Cuándo la entregó quien la ejecuta (evidencia completa o fin real); null = no la ha entregado. */
  entregadaAt: Date | null;
};

export type PlanRelleno = {
  cambios: Record<string, unknown>;
  /** Lo que se decidió y por qué (tipo corregido, mediana del tipo, entrega movida). */
  nota: string | null;
};

/** Ya la entregó: está por validar o su evidencia está completa. */
export function yaEntregada(fila: Pick<FilaAbierta, 'estatus' | 'entregadaAt'>): boolean {
  return fila.estatus === 'Por Validar' || Boolean(fila.entregadaAt);
}

/**
 * Trabajos que el título nombra sin lugar a duda, aunque el tipo guardado diga otro: tubería,
 * charola, registros y cable son cableado y canalización; las facturas, facturación.
 */
const TIPO_POR_TITULO: Array<[RegExp, { coreKind: string; ticketTypeCustom: string }]> = [
  [/\b(tuberia|charola|canalizacion|registros?|cableado|cable|nodos?)\b/, { coreKind: 'tarea', ticketTypeCustom: 'Cableado y canalización' }],
  [/\bfacturas?\b/, { coreKind: 'tarea', ticketTypeCustom: 'Facturación y contabilidad' }],
];

/** El tipo correcto si el título (o sus indicaciones) dice otro trabajo; null si cuadra o no se sabe. */
export function tipoPorTitulo(fila: Pick<FilaAbierta, 'titulo' | 'indicaciones' | 'coreKind' | 'ticketType' | 'ticketTypeCustom'>) {
  const texto = normalizar(`${fila.titulo ?? ''} ${fila.indicaciones ?? ''}`);
  const actual = reglaDe(fila)?.clave ?? null;
  for (const [patron, tipo] of TIPO_POR_TITULO) {
    if (!patron.test(texto)) continue;
    const clave = reglaDe(tipo)?.clave ?? null;
    // Servicio y obra ya miden instalación y cableado en sitio: no se cambian.
    if (['servicio', 'obra', 'proyecto'].includes(String(fila.coreKind ?? '').toLowerCase())) return null;
    return clave && clave !== actual ? tipo : null;
  }
  return null;
}

/**
 * Qué se le pone a una fila (solo lo que le falta). `est` = estándar leído del título (con el tipo
 * corregido, si lo hay). En lo entregado: `tipicoMin` = mediana real de su tipo.
 */
export function planDeRelleno(
  fila: FilaAbierta,
  est: EstandarCalculado | null,
  opciones: { tipoCorregido?: { coreKind: string; ticketTypeCustom: string } | null; tipicoMin?: number | null } = {},
): PlanRelleno {
  const cambios: Record<string, unknown> = {};
  const notas: string[] = [];
  if (yaEntregada(fila)) {
    if (fila.tiempoEstimadoMin == null) {
      const minutos = opciones.tipicoMin && opciones.tipicoMin > 0 ? opciones.tipicoMin : est?.totalMin ?? null;
      if (minutos) {
        cambios.tiempoEstimadoMin = Math.min(720, Math.max(5, Math.round(minutos / 5) * 5));
        cambios.estandarCambiadoMotivo = MOTIVO_RELLENO;
        notas.push(opciones.tipicoMin ? 'entregada: tiempo = mediana real de su tipo, sin estándar' : 'entregada: tiempo del título (su tipo no tiene mediana), sin estándar');
      }
    }
  } else {
    if (opciones.tipoCorregido) {
      Object.assign(cambios, opciones.tipoCorregido);
      notas.push(`tipo corregido por el título: ${opciones.tipoCorregido.ticketTypeCustom} (era ${fila.ticketTypeCustom ?? fila.coreKind})`);
    }
    if (fila.tiempoEstandarMin == null && est) {
      cambios.tiempoEstandarMin = est.totalMin;
      cambios.estandarDesglose = [...est.desglose, ...est.supuestos.map((s) => ({ concepto: `Supuesto: ${s}`, minutos: 0 }))];
      if ((!fila.complejidad || opciones.tipoCorregido) && est.complejidad) cambios.complejidad = est.complejidad;
      if ((!fila.unidades || opciones.tipoCorregido) && est.unidades) cambios.unidades = est.unidades;
    }
    const estandar = fila.tiempoEstandarMin ?? (cambios.tiempoEstandarMin as number | undefined) ?? null;
    if (fila.tiempoEstimadoMin == null && estandar) cambios.tiempoEstimadoMin = estandar;
  }

  if (!fila.periodoFin) {
    if (!fila.fechaEntregaEsperada && !fila.fechaMaxima) {
      const base = fila.fechaInicio ?? fila.fechaAsignacion;
      if (base) {
        let limite = workDayEnd(base);
        if (fila.entregadaAt && fila.entregadaAt > limite) {
          limite = workDayEnd(fila.entregadaAt);
          notas.push('se entregó después del día de su inicio: entrega al fin del día en que se entregó (no cambia su «a tiempo»)');
        }
        cambios.fechaEntregaEsperada = limite;
        cambios.fechaMaxima = limite;
      }
    } else if (!fila.fechaEntregaEsperada) {
      cambios.fechaEntregaEsperada = fila.fechaMaxima;
    } else if (!fila.fechaMaxima) {
      cambios.fechaMaxima = fila.fechaEntregaEsperada;
    }
  }
  return { cambios, nota: notas.length ? notas.join('; ') : null };
}

/** «A tiempo» con el límite que tendría (sin límite cuenta a tiempo, como en los KPI). */
export function aTiempo(entregadaAt: Date | null, limite: Date | null): boolean | null {
  if (!entregadaAt) return null;
  return !limite || entregadaAt.getTime() <= limite.getTime();
}
