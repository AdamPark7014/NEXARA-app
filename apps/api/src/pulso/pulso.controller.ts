import { Controller, Get, UseGuards } from '@nestjs/common';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { errorCorto } from '../common/cron/error-corto.js';
import { latido, latidoEncendido, type EstadoTarea } from '../common/cron/latido-tareas.js';
import { evaluarTareas, type EstadoEvaluacion } from '../common/cron/evaluar-tareas.js';
import { TAREAS_CATALOGO, type TareaCatalogo } from '../common/cron/tareas-catalogo.js';

/** Una tarea programada tal como la ve un administrador. Fechas en ISO 8601 (UTC); duraciones en milisegundos. */
export interface FilaTarea {
  nombre: string;
  grupo: string;
  /** Qué hace, en español sencillo. */
  que: string;
  critica: boolean;
  zona: 'MX' | 'UTC';
  cron: string;
  /** El mayor hueco normal entre dos disparos, en minutos. */
  periodoMaxMin: number;
  /** Cuánto silencio se tolera antes de marcarla atrasada, en minutos. */
  limiteMin: number;
  estado: EstadoEvaluacion;
  /** Una línea que explica el estado. */
  detalle: string;
  corridas: number;
  fallos: number;
  saltadas: number;
  ultimoInicio: string | null;
  ultimoFin: string | null;
  ultimoOk: string | null;
  duracionUltimaMs: number | null;
  duracionMaxMs: number | null;
  fallosSeguidos: number;
  /** Ya saneado: sin correos, tokens ni números largos. */
  ultimoError: string | null;
  enCursoDesde: string | null;
  /** Cuándo se dejó el aviso en el log por última vez; `null` si no hay aviso vigente. */
  avisadoAt: string | null;
}

/** Lo que dice cada fila cuando el latido está apagado a propósito (`PULSO_LATIDO=0`): no se juzga, no se acusa. */
export const DETALLE_LATIDO_APAGADO =
  'El latido está apagado (PULSO_LATIDO=0): no se registra nada, así que no se puede saber si esta tarea corre.';

const aIso = (ms: number | null | undefined): string | null =>
  typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null;

/**
 * Junta catálogo, latido y juicio en una fila por tarea, en el orden del catálogo. Pura: todo entra por parámetro.
 * `ultimoError` se vuelve a pasar por `errorCorto` ANTES de juzgar, aunque el latido ya lo guarda saneado: lo que algún
 * día devuelva la base (historial de antes de un reinicio) no debe llegar a una pantalla sin la misma limpieza, ni en el
 * campo ni en el `detalle`, que también cita el error.
 */
export function filasDeTareas(
  estados: EstadoTarea[],
  catalogo: Record<string, TareaCatalogo>,
  ahoraMs: number,
  arranqueMs: number,
  opciones: { relevo?: boolean; latidoApagado?: boolean } = {},
): FilaTarea[] {
  const limpios = estados.map((e) => (e.ultimoError ? { ...e, ultimoError: errorCorto(e.ultimoError) } : e));
  const porNombre = new Map(limpios.map((e) => [e.nombre, e]));
  // Con el latido apagado nadie deja rastro: juzgar daría «atrasada» a todas. El relevo manda: ya dice «relevo».
  const sinJuicio = opciones.latidoApagado === true && opciones.relevo !== true;
  return evaluarTareas(limpios, catalogo, ahoraMs, arranqueMs, { relevo: opciones.relevo }).map((ev) => {
    const tarea = catalogo[ev.nombre]!;
    const e = porNombre.get(ev.nombre);
    return {
      nombre: ev.nombre,
      grupo: tarea.grupo,
      que: tarea.que,
      critica: ev.critica,
      zona: tarea.zona,
      cron: tarea.cron,
      periodoMaxMin: Math.round(ev.periodoMs / 60_000),
      limiteMin: Math.round(ev.limiteMs / 60_000),
      estado: sinJuicio ? 'sin_datos' : ev.estado,
      detalle: sinJuicio ? DETALLE_LATIDO_APAGADO : ev.detalle,
      corridas: e?.corridas ?? 0,
      fallos: e?.fallos ?? 0,
      saltadas: e?.saltadas ?? 0,
      ultimoInicio: aIso(e?.ultimoInicio),
      ultimoFin: aIso(e?.ultimoFin),
      ultimoOk: aIso(e?.ultimoOk),
      duracionUltimaMs: e?.duracionUltimaMs ?? null,
      duracionMaxMs: e?.duracionMaxMs ?? null,
      fallosSeguidos: e?.fallosSeguidos ?? 0,
      ultimoError: e?.ultimoError ?? null,
      enCursoDesde: aIso(e?.enCursoDesde),
      avisadoAt: aIso(e?.avisadoAt),
    };
  });
}

/**
 * Estado de las tareas programadas para administradores (permiso de consola, como `/jobs`). Solo lectura: no toca la
 * base y se calcula en el momento de la consulta, así dice la verdad aunque el cron del vigilante estuviera apagado.
 * Es la fuente de la pantalla futura del centro de control. No se expone sin sesión.
 */
@Controller('pulso')
@UseGuards(RbacGuard)
export class PulsoController {
  @Get('tareas')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  tareas(): FilaTarea[] {
    return filasDeTareas(latido.instantanea(), TAREAS_CATALOGO, Date.now(), latido.arranqueMs(), {
      relevo: process.env.NEXARA_RELEVO === '1',
      latidoApagado: !latidoEncendido(),
    });
  }
}
