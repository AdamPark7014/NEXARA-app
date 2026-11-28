import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { MetricsService } from '../observability/metrics.service.js';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';
import { latido, latidoEncendido } from '../common/cron/latido-tareas.js';
import { evaluarTareas, type EstadoEvaluacion, type EvaluacionTarea } from '../common/cron/evaluar-tareas.js';
import { TAREAS_CATALOGO, type TareaCatalogo } from '../common/cron/tareas-catalogo.js';
import { leerModoPiloto, type ModoPiloto } from '../common/piloto/interruptor-piloto.js';

/**
 * Interruptor del vigilante (`system_settings`, lo lee `leerModoPiloto`: no hay otro lector).
 *
 *   - `apagado`  (de fábrica, y también si la fila está mal escrita): no hace nada, ni log ni métricas. La tarea sigue
 *                latiendo, como exige la guardiana de `tareas-catalogo.spec.ts`.
 *   - `observar` : deja el aviso en el log y publica los medidores. Es todo lo que el vigilante sabe hacer: NO escribe en
 *                  la base y NO manda mensajes a nadie.
 *   - `activo`   : hoy igual que `observar`. Queda reservado para cuando el aviso llegue a personas (la ola 2); así
 *                  encenderlo después no cambia el significado de lo que ya esté en `observar`.
 *
 * Para encenderlo, sin desplegar: `PUT /api/settings` con `{ key: 'pulso.vigilante', value: 'observar', category: 'piloto' }`.
 */
export const CLAVE_PULSO_VIGILANTE = 'pulso.vigilante';

/** Medidores que publica cada vuelta (Prometheus, `GET /metrics`). */
export const METRICA_TAREAS_ATRASADAS = 'pulso_tareas_atrasadas';
export const METRICA_TAREAS_CRITICAS_ROJAS = 'pulso_tareas_criticas_rojas';

/** Los estados que cuentan como problema. `sin_datos` nunca lo es: tras cada despliegue casi todas arrancan así. */
const ESTADOS_CON_PROBLEMA: ReadonlySet<EstadoEvaluacion> = new Set(['atrasada', 'atorada', 'fallando']);

const ETIQUETA: Record<'atrasada' | 'atorada' | 'fallando', string> = {
  atrasada: 'está atrasada',
  atorada: 'está atorada',
  fallando: 'está fallando',
};

export interface ResumenRevision {
  modo: ModoPiloto;
  /** Tareas con problema ahora mismo (atrasada, atorada o fallando). */
  conProblema: number;
  /** De ellas, las críticas (las que ponen el semáforo en rojo). */
  criticasRojas: number;
  /** Avisos nuevos que salieron al log en esta vuelta. */
  avisadas: number;
  /** Tareas que se recuperaron en esta vuelta. */
  recuperadas: number;
}

const SIN_REVISAR = (modo: ModoPiloto): ResumenRevision => ({
  modo,
  conProblema: 0,
  criticasRojas: 0,
  avisadas: 0,
  recuperadas: 0,
});

/**
 * Vigilante de las tareas programadas (Nexara Piloto, «Pulso»). Cada 5 minutos mira el latido en memoria
 * (`latido-tareas.ts`), lo juzga contra el catálogo (`evaluarTareas`) y deja UN solo aviso en el log por cada tarea que se
 * atrasa, se atora o falla; cuando se recupera deja un solo «recuperada» y vuelve a armarse.
 *
 * Solo observa: no modifica datos ni manda mensajes. El aviso real a Adam lo da la comprobación de salud (que evalúa en
 * el momento de la consulta, así que dice la verdad aunque este cron muriera); este log es el rastro para quien investigue.
 *
 * Calla en tres casos, sin log ni medidores: interruptor `apagado`, contenedor de relevo (`NEXARA_RELEVO=1`) y latido
 * apagado (`PULSO_LATIDO=0`: sin rastro de nadie, todas las tareas parecerían atrasadas).
 *
 * Sin candado entre procesos: `pg_try_advisory_lock` no sirve con el pool de Prisma (RELEVO del 18-11). El «aviso único»
 * se apoya en `avisadoAt` del latido (memoria del proceso; la persistencia entre reinicios es de otro cambio del paquete).
 * Dos procesos vivos al mismo tiempo avisarían cada uno una vez: es aceptable para un log.
 */
@Injectable()
export class VigilanteTareasService {
  private readonly logger = new Logger(VigilanteTareasService.name);

  /**
   * Tareas ya avisadas que el latido no pudo recordar (su tope de nombres estaba lleno). Es casi siempre vacío: el aviso
   * se guarda en el latido (`avisadoAt`), incluso para una tarea que nunca corrió y aún no tiene estado.
   */
  private readonly avisadasAparte = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * El interruptor va DENTRO del trabajo (regla de la guardiana): apagado, el vigilante sigue latiendo y no actúa.
   * El relevo de un despliegue no carga el planificador, así que esta tarea ni siquiera se programa allá.
   */
  @Cron('*/5 * * * *', { name: 'pulso-vigilante' })
  async cron(): Promise<void> {
    await runScheduledJob('pulso:vigilante', this.logger, () => this.revisar());
  }

  /** Una vuelta de revisión. `ahora` y `catalogo` solo existen para las pruebas. */
  async revisar(
    ahora: number = Date.now(),
    catalogo: Record<string, TareaCatalogo> = TAREAS_CATALOGO,
  ): Promise<ResumenRevision> {
    const modo = await leerModoPiloto(this.prisma, CLAVE_PULSO_VIGILANTE, 'apagado');
    if (modo === 'apagado') return SIN_REVISAR(modo);
    // El contenedor de relevo no corre tareas: no hay nada que juzgar y no debe dar alarmas.
    if (process.env.NEXARA_RELEVO === '1') return SIN_REVISAR(modo);
    // Con el latido apagado a propósito (`PULSO_LATIDO=0`) ninguna tarea deja rastro: todas saldrían «atrasadas» sin serlo.
    if (!latidoEncendido()) return SIN_REVISAR(modo);

    const estados = latido.instantanea();
    const avisadaAntes = new Map(estados.map((e) => [e.nombre, e.avisadoAt !== null]));
    const evaluaciones = evaluarTareas(estados, catalogo, ahora, latido.arranqueMs());

    const resumen = SIN_REVISAR(modo);
    for (const ev of evaluaciones) {
      const conProblema = ESTADOS_CON_PROBLEMA.has(ev.estado);
      if (conProblema) {
        resumen.conProblema += 1;
        if (ev.critica) resumen.criticasRojas += 1;
      }
      try {
        const yaAvisada = avisadaAntes.get(ev.nombre) === true || this.avisadasAparte.has(ev.nombre);
        if (conProblema && !yaAvisada) {
          this.logger.error(this.lineaDeAviso(ev));
          // Si el latido no pudo anotarlo (tope de nombres lleno), se recuerda aquí: no repetir el aviso cada vuelta.
          if (!latido.marcarAvisada(ev.nombre, ahora)) this.avisadasAparte.add(ev.nombre);
          resumen.avisadas += 1;
        } else if (ev.estado === 'ok' && yaAvisada) {
          this.logger.log(`[PULSO] Tarea "${ev.nombre}" recuperada: ${ev.detalle}`);
          latido.limpiarAviso(ev.nombre);
          this.avisadasAparte.delete(ev.nombre);
          resumen.recuperadas += 1;
        }
        // `sin_datos` no toca el aviso: ni lo arma ni lo desarma.
      } catch (error) {
        // Un fallo con una tarea no debe dejar sin revisar a las demás.
        this.logger.warn(`[PULSO] No pude revisar "${ev.nombre}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    this.publicar(resumen);
    return resumen;
  }

  private lineaDeAviso(ev: EvaluacionTarea): string {
    const etiqueta = ETIQUETA[ev.estado as keyof typeof ETIQUETA];
    return `[PULSO] Tarea "${ev.nombre}" ${etiqueta}${ev.critica ? ' (crítica)' : ''}: ${ev.detalle}`;
  }

  private publicar(resumen: ResumenRevision): void {
    try {
      this.metrics.setGauge(METRICA_TAREAS_ATRASADAS, resumen.conProblema);
      this.metrics.setGauge(METRICA_TAREAS_CRITICAS_ROJAS, resumen.criticasRojas);
    } catch {
      // Los medidores son un extra: nunca deben tumbar la revisión.
    }
  }
}
