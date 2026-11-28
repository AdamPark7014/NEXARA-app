import { huecoMaximoMinutos } from './cron-periodo.js';
import type { EstadoTarea } from './latido-tareas.js';
import { FACTOR_OMISION, type TareaCatalogo } from './tareas-catalogo.js';

/**
 * Juez puro del latido: dado lo que se sabe de cada tarea (`latido-tareas.ts`) y lo que debería pasar
 * (`tareas-catalogo.ts`), dice cuál está bien y cuál no. No lee la base ni el reloj: todo entra por parámetro, así se
 * prueba con horas inventadas. Lo usa el vigilante (C2) y las comprobaciones de salud (C3).
 *
 * Estados, en el orden en que se deciden:
 *   - `ok`        : late dentro de lo esperado.
 *   - `sin_datos` : todavía no le tocaba (el proceso arrancó hace menos que su límite) o no hay historial. NUNCA es
 *                   rojo: tras cada despliegue, hasta que la persistencia (1B) devuelva el historial, las tareas largas
 *                   estarían «sin datos» y no es una falla.
 *   - `atorada`   : arrancó hace más de max(2 periodos, 15 min) y no termina. Es peor de lo que parece: la tarea sigue
 *                   «viva» y todas las vueltas siguientes se saltan en silencio.
 *   - `atrasada`  : no se dispara hace más de `factor` periodos (límite mínimo de 3 min), o ya pasó su límite desde el
 *                   arranque y nunca latió. Una tarea que está corriendo en ese momento no es «atrasada»: o va bien o está atorada.
 *   - `fallando`  : 3 corridas seguidas con error.
 *
 * Periodo = el mayor hueco entre dos disparos del cron (`huecoMaximoMinutos`): una tarea de lunes a viernes puede
 * callar de viernes a lunes sin que sea una falla. Límite = max(factor × periodo, 3 minutos). El factor por omisión es 2
 * («no corre en el doble de su periodo»).
 *
 * Referencia del atraso: el silencio REAL, `ahora - ultimoInicio`. Si el último inicio es de antes del arranque (es el
 * historial que devuelve la base, 1B), la tarea solo recibe una gracia corta, `min(límite, 15 min)` desde el arranque,
 * para que el proceso nuevo tenga su primer turno; pasada la gracia, si su silencio ya supera el límite, sale
 * `atrasada`. No se mide desde el arranque porque se despliega varias veces al día y el límite de una tarea diaria es de
 * 48 h (144 h en las de lunes a viernes): una tarea que lleva días muerta nunca llegaría a «atrasada» y justo ese es el
 * caso que el historial en base quiere cubrir. El arranque solo es la referencia de las tareas SIN historial.
 *
 * Con `relevo: true` (el contenedor de relevo de un despliegue, `NEXARA_RELEVO=1`, no carga el planificador) todo sale
 * `ok` con detalle `relevo`: el relevo no corre tareas y no debe dar alarmas.
 */

export type EstadoEvaluacion = 'ok' | 'sin_datos' | 'atrasada' | 'atorada' | 'fallando';

export interface EvaluacionTarea {
  nombre: string;
  estado: EstadoEvaluacion;
  critica: boolean;
  /** Hueco máximo entre disparos, en milisegundos. */
  periodoMs: number;
  /** Cuánto silencio se tolera, en milisegundos. */
  limiteMs: number;
  /** Cuánto lleva sin arrancar (desde su último inicio; desde el arranque del proceso si no tiene historial); `null` si no aplica. */
  edadMs: number | null;
  /** Una línea en español sencillo. */
  detalle: string;
}

export interface OpcionesEvaluacion {
  relevo?: boolean;
}

export const LIMITE_MINIMO_MS = 3 * 60_000;
export const ATORADA_MINIMO_MS = 15 * 60_000;
/** Tope de la gracia tras un arranque para una tarea con historial de antes del reinicio. */
export const GRACIA_ARRANQUE_MAX_MS = 15 * 60_000;
export const FALLOS_SEGUIDOS_ALARMA = 3;

const cachePeriodos = new Map<string, number>();

/** Hueco máximo de un cron en ms. Se calcula una sola vez por expresión. */
export function periodoMs(cron: string): number {
  let valor = cachePeriodos.get(cron);
  if (valor === undefined) {
    valor = huecoMaximoMinutos(cron) * 60_000;
    cachePeriodos.set(cron, valor);
  }
  return valor;
}

/** Límite de silencio de una tarea del catálogo, en ms. */
export function limiteMs(tarea: Pick<TareaCatalogo, 'cron' | 'factor'>): number {
  return Math.max((tarea.factor ?? FACTOR_OMISION) * periodoMs(tarea.cron), LIMITE_MINIMO_MS);
}

/**
 * Gracia tras el arranque para una tarea cuyo último inicio es de antes del reinicio: nunca más que su límite (las
 * tareas cortas conservan su tolerancia) ni más de 15 minutos (las largas se juzgan por su silencio real).
 */
export function graciaArranqueMs(tarea: Pick<TareaCatalogo, 'cron' | 'factor'>): number {
  return Math.min(limiteMs(tarea), GRACIA_ARRANQUE_MAX_MS);
}

function duracion(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 90) return `${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 48) return `${horas} h`;
  return `${Math.round(horas / 24)} días`;
}

/**
 * Evalúa cada tarea del catálogo. Las que no estén en `estados` se juzgan como «sin estado»; los estados con nombres
 * que no estén en el catálogo se ignoran. El resultado sale en el orden del catálogo.
 */
export function evaluarTareas(
  estados: EstadoTarea[],
  catalogo: Record<string, TareaCatalogo>,
  ahoraMs: number,
  arranqueMs: number,
  opciones: OpcionesEvaluacion = {},
): EvaluacionTarea[] {
  const porNombre = new Map(estados.map((e) => [e.nombre, e]));
  const salida: EvaluacionTarea[] = [];

  for (const [nombre, tarea] of Object.entries(catalogo)) {
    const periodo = periodoMs(tarea.cron);
    const limite = limiteMs(tarea);
    const base = { nombre, critica: tarea.critica === true, periodoMs: periodo, limiteMs: limite };

    if (opciones.relevo) {
      salida.push({ ...base, estado: 'ok', edadMs: null, detalle: 'relevo' });
      continue;
    }

    const estado = porNombre.get(nombre);
    const desdeArranque = Math.max(ahoraMs - arranqueMs, 0);

    if (!estado || estado.ultimoInicio === null) {
      if (desdeArranque <= limite) {
        salida.push({ ...base, estado: 'sin_datos', edadMs: desdeArranque, detalle: 'Todavía no le tocaba correr.' });
      } else {
        salida.push({
          ...base,
          estado: 'atrasada',
          edadMs: desdeArranque,
          detalle: `No ha corrido desde que arrancó el servidor, hace ${duracion(desdeArranque)}.`,
        });
      }
      continue;
    }

    // Una tarea que está corriendo ahora mismo no está «atrasada»: o va bien, o está atorada.
    const enCurso = estado.enCursoDesde !== null;
    if (estado.enCursoDesde !== null) {
      const corriendo = ahoraMs - estado.enCursoDesde;
      if (corriendo > Math.max(2 * periodo, ATORADA_MINIMO_MS)) {
        salida.push({
          ...base,
          estado: 'atorada',
          edadMs: ahoraMs - estado.ultimoInicio,
          detalle: `Lleva ${duracion(corriendo)} corriendo sin terminar; las vueltas siguientes se saltan.`,
        });
        continue;
      }
    }

    // El silencio real, desde el último inicio. Si ese inicio es de antes del arranque (historial que devolvió la base),
    // el proceso nuevo solo tiene una gracia corta para su primer turno; pasada, cuenta el silencio completo.
    const edad = ahoraMs - estado.ultimoInicio;
    const deProcesoAnterior = estado.ultimoInicio < arranqueMs;
    const enGracia = deProcesoAnterior && desdeArranque <= graciaArranqueMs(tarea);
    const pasoSuLimite = !enCurso && edad > limite;

    if (pasoSuLimite && !enGracia) {
      salida.push({
        ...base,
        estado: 'atrasada',
        edadMs: edad,
        detalle: `No arranca hace ${duracion(edad)} (lo normal es cada ${duracion(periodo)} como máximo).`,
      });
      continue;
    }

    if (estado.fallosSeguidos >= FALLOS_SEGUIDOS_ALARMA) {
      salida.push({
        ...base,
        estado: 'fallando',
        edadMs: edad,
        detalle: `Falló ${estado.fallosSeguidos} veces seguidas${estado.ultimoError ? `: ${estado.ultimoError}` : '.'}`,
      });
      continue;
    }

    salida.push({
      ...base,
      estado: 'ok',
      edadMs: edad,
      detalle: pasoSuLimite
        ? `El servidor arrancó hace ${duracion(desdeArranque)}: todavía no le tocaba correr (su última vez fue hace ${duracion(edad)}).`
        : 'Late bien.',
    });
  }

  return salida;
}
