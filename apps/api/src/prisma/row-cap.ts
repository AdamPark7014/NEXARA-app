/**
 * Tope de filas para los `findMany` que no piden `take`.
 *
 * En el código hay 252 métodos que consultan sin límite, 189 de ellos colgados
 * de un `@Get`. Cada uno es una consulta que crece con el negocio hasta que un
 * día trae la tabla entera a memoria y tumba el proceso.
 *
 * Ponerles paginación a los 189 cambiaría la forma de la respuesta (de arreglo
 * a `{data, meta}`) y rompería las pantallas que hoy esperan un arreglo. Este
 * tope es la otra mitad: acota **todos** de golpe sin tocar el contrato.
 *
 * Dos decisiones deliberadas:
 *
 *   - El tope es alto (5000 por defecto): está para evitar la caída, no para
 *     paginar. Aun así **sí recorta**: al 02-11-2026 cinco tablas lo rebasan
 *     (`integra_push_events` va en 970 mil) y el sync de CT leyó así 5000 de
 *     14,877 filas de `productos_ct` hasta `575471cd`. Quien necesite una tabla
 *     entera debe pedirla por páginas con `take`, que no pasa por este tope.
 *   - Cuando recorta, **avisa**. Un recorte silencioso es peor que la consulta
 *     sin límite: daría respuestas incompletas que nadie sabría interpretar.
 *     El aviso dice qué modelo fue y qué campos filtra: esa consulta es la que
 *     necesita paginación de verdad. Va al log y a `audit_logs`
 *     (`entityType = 'PrismaRowCap'`, se limpia a los 90 días), porque el log
 *     del contenedor se pierde con cada despliegue. Si hay recortes nuevos, cada
 *     mañana sale una tarjeta a `developer@` (`aviso-recortes.service.ts`).
 *
 * Limitación conocida: sólo alcanza al `findMany` de primer nivel. Las
 * relaciones traídas con `include` no pasan por el middleware, así que un
 * `include: { items: true }` sigue sin tope.
 */

export const DEFAULT_ROW_CAP = 5000;

/** Permite ajustarlo por entorno sin recompilar. */
export function resolveRowCap(raw = process.env.PRISMA_MAX_ROWS): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_ROW_CAP;
}

/**
 * ¿Hay que aplicar tope a esta consulta?
 *
 * No, si el llamador ya decidió un `take`: ahí sabe lo que pide. Tampoco a las
 * acciones que no devuelven listas.
 */
export function shouldCap(action: string, args: unknown): boolean {
  if (action !== 'findMany') return false;
  const a = args as { take?: unknown } | undefined;
  return a?.take === undefined || a?.take === null;
}

/**
 * `take` que se inyecta: uno más que el tope.
 *
 * Ese registro de más no se devuelve; sirve para distinguir "vinieron
 * justo 5000" de "había más y se cortó", y así avisar sólo cuando toca.
 */
export function probeTake(cap: number): number {
  return cap + 1;
}

export type CapResult<T> = { rows: T[]; truncated: boolean };

/** Recorta al tope y dice si sobraba. */
export function applyCap<T>(rows: T[], cap: number): CapResult<T> {
  if (rows.length <= cap) return { rows, truncated: false };
  return { rows: rows.slice(0, cap), truncated: true };
}

/** Con esto se encuentra un recorte en `audit_logs`. */
export const ENTIDAD_RECORTE = 'PrismaRowCap';
export const ACCION_RECORTE = 'RECORTE';

export type Recorte = { modelo: string; tope: number; filtro: string[] };

/**
 * Campos que filtra la consulta, para saber de qué llamada se trata.
 *
 * Solo los nombres: los valores pueden ser datos de clientes y no se guardan.
 */
export function camposDeFiltro(where: unknown): string[] {
  const campos = new Set<string>();
  const visitar = (filtro: unknown) => {
    if (Array.isArray(filtro)) return filtro.forEach(visitar);
    if (!filtro || typeof filtro !== 'object') return;
    for (const [campo, valor] of Object.entries(filtro)) {
      if (campo === 'AND' || campo === 'OR' || campo === 'NOT') visitar(valor);
      else campos.add(campo);
    }
  };
  visitar(where);
  return [...campos].sort();
}

/**
 * El middleware del tope: pide uno de más, recorta y dice si sobraba.
 */
export async function runWithRowCap<P extends { model?: string; action: string; args?: any }, R>(
  params: P,
  next: (params: P) => Promise<R>,
  cap: number,
  onRecorte: (recorte: Recorte) => void,
): Promise<R> {
  if (!shouldCap(params.action, params.args)) return next(params);

  params.args = { ...(params.args ?? {}), take: probeTake(cap) };
  const resultado = await next(params);
  if (!Array.isArray(resultado)) return resultado;

  const { rows, truncated } = applyCap(resultado, cap);
  if (truncated) {
    onRecorte({
      modelo: params.model ?? 'desconocido',
      tope: cap,
      filtro: camposDeFiltro(params.args?.where),
    });
  }
  return rows as R;
}

/**
 * Cuenta los recortes de cada consulta y dice cuándo guardar uno.
 *
 * Una pantalla que se refresca sola podría recortar cada pocos segundos, y
 * `audit_logs` ya llenó el disco una vez. Se guarda el primero y después uno
 * por hora, con los que lleva. Lo contado entre uno y otro se pierde si el
 * servidor se reinicia, pero el primero tras reiniciar siempre se guarda.
 */
export class ContadorDeRecortes {
  private readonly vistos = new Map<string, { desde: number; veces: number }>();

  constructor(private readonly ventanaMs = 3_600_000) {}

  /** Cuántas veces hay que guardar ahora, o `null` si aún no toca. */
  anotar(consulta: string, ahora = Date.now()): number | null {
    const visto = this.vistos.get(consulta);
    if (!visto) {
      this.vistos.set(consulta, { desde: ahora, veces: 0 });
      return 1;
    }
    visto.veces += 1;
    if (ahora - visto.desde < this.ventanaMs) return null;
    this.vistos.set(consulta, { desde: ahora, veces: 0 });
    return visto.veces;
  }
}
