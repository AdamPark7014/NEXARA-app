/**
 * UNA SOLA regla de retención de la bitácora (`audit_logs`).
 *
 * Antes había dos purgas que se contradecían: `audit-cleanup` (domingos, 90 días) y `purga-bitacora` (día 1 de cada
 * mes, 365 días). Mandaba la corta y la de 365 nunca borraba nada. Ahora queda una sola, la de `AuditService`, y el
 * número de días sale de `system_settings` (clave `audit.retencion_dias`), así que se cambia sin desplegar.
 *
 * QUIÉN DECIDE EL NÚMERO: Adam. Mientras no diga otro, rige `RETENCION_POR_OMISION_DIAS`.
 *
 * Cómo fijar el número (sin desplegar): `apps/api/scripts/set-retencion-bitacora.sql`, o
 * `PUT /api/settings { key: 'audit.retencion_dias', value: '180', category: 'sistema' }` (permiso CONSOLE_ADMIN).
 * Para frenar el borrado por un tiempo se sube el valor al techo (3650): no existe un «nunca borrar» a propósito,
 * porque una bitácora sin límite acaba llenando el disco.
 *
 * QUÉ FILA SE LEE (igual que el interruptor del Piloto, `common/piloto/interruptor-piloto.ts`): CUALQUIER fila con esa
 * clave, de plataforma o de empresa, y si hay varias manda la que se tocó más recientemente (`updatedAt`, y a
 * igualdad la de mayor `id`). Razón: `PUT /api/settings` guarda la fila con la empresa de quien llama, no con
 * `companyId` nulo; un lector que solo mirara `companyId = null` nunca vería el número que fije Adam por esa vía. Y la
 * purga corre en un `@Cron`, sin petición ni empresa. Es un número, no un interruptor de modos, así que no usa
 * `leerModoPiloto`, pero comparte su semántica.
 *
 * QUÉ PASA CON UN VALOR MAL ESCRITO (`PUT /api/settings` no valida esta clave, así que '1 año', '365 días' o '36 5'
 * son posibles; y lo que la purga borra no se recupera porque el respaldo diario excluye `audit_logs`). No se adivina
 * un número que Adam no escribió:
 *   - sin fila → 90 (la omisión; es un número válido y queda como «último válido»).
 *   - fila con un entero → ese entero, llevado a [PISO_DIAS, TECHO_DIAS] (menor que el piso → 30; mayor que el techo
 *     → 3650).
 *   - fila ilegible (vacía, o que no es un entero escrito con dígitos): se conserva el ÚLTIMO NÚMERO VÁLIDO que este
 *     proceso leyó y, si no hay ninguno, `dias` queda en `null` y la purga NO borra nada (falla a la vista en el
 *     latido de la tarea) hasta que se corrija la fila. En los dos casos se escribe un aviso en el log, una vez por
 *     lectura y sin copiar el valor.
 *   - si la base falla se conserva el último número válido (si nunca hubo uno, 90).
 * Cada lectura dice de dónde salió el número (`origen`), y la purga lo deja en su línea de log.
 */

import { Logger } from '@nestjs/common';

export const CLAVE_RETENCION_BITACORA = 'audit.retencion_dias';

/** Lo mínimo que se borra, también en las llamadas manuales (`POST /api/audit/purge`). */
export const PISO_DIAS = 30;

/** Diez años: el máximo que se acepta (un valor mayor se lleva a este). */
export const TECHO_DIAS = 3650;

/**
 * Retención cuando nadie ha fijado otra. Este NO es un número nuevo: es lo que de hecho aplicaba cada domingo la
 * purga que se borra (`audit-cleanup`). El número definitivo lo decide Adam.
 */
export const RETENCION_POR_OMISION_DIAS = 90;

/** Cuánto vale una lectura antes de volver a preguntarle a la base. */
export const CACHE_RETENCION_MS = 5 * 60_000;

/** Filas por lote al borrar (un solo `deleteMany` gigante bloquea la tabla y llena el WAL). */
export const LOTE_PURGA = 5_000;

/** Tope de lotes por corrida: 40 × 5,000 = 200,000 filas. Lo que quede se borra en la siguiente corrida. */
export const MAX_LOTES_PURGA = 40;

/** Pausa entre lotes para que el disco y la replicación respiren. */
export const PAUSA_ENTRE_LOTES_MS = 200;

/** Lo mínimo que se necesita de Prisma. `PrismaService` lo cumple tal cual; en pruebas basta un objeto con `findFirst`. */
export type LectorRetencion = {
  systemSetting: {
    findFirst(args: any): Promise<{ value: string } | null>;
  };
};

/** Lleva un texto de solo dígitos a [PISO_DIAS, TECHO_DIAS]. */
function llevarAlRango(digitos: string): number {
  const dias = Number(digitos);
  // Una cadena de cientos de dígitos da Infinity: es un número, y enorme, así que va al techo.
  if (!Number.isFinite(dias)) return TECHO_DIAS;
  return Math.min(TECHO_DIAS, Math.max(PISO_DIAS, dias));
}

/**
 * Traduce el texto guardado a días. Nunca lanza. Solo se aceptan enteros escritos con dígitos (`180`, ` 180 `) y el
 * resultado queda siempre dentro de [PISO_DIAS, TECHO_DIAS].
 *
 * Lo que NO es un entero (`abc`, vacío, `-5`, `1.5`, `1e3`, `180 días`, `36 5`, algo que no es texto) devuelve `null`:
 * quien llama decide qué hacer y NO se inventa un número (antes caía a 90 en silencio, y lo borrado de más no vuelve).
 */
export function interpretarRetencionDias(valor: unknown): number | null {
  if (typeof valor !== 'string') return null;
  const texto = valor.trim();
  if (!/^\d+$/.test(texto)) return null;
  return llevarAlRango(texto);
}

/**
 * Días que pide una llamada manual (`POST /api/audit/purge`, cuerpo `{ days }`).
 *   - `undefined` o `null` → `null`: no pidió nada, rige la regla configurada.
 *   - un entero (número o texto de dígitos) → ese número, llevado a [PISO_DIAS, TECHO_DIAS]; `10` se vuelve 30.
 *   - cualquier otra cosa (`abc`, `NaN`, objeto, booleano, negativo) → `'invalido'`: quien llama responde 400 en lugar
 *     de adivinar y borrar algo que nadie pidió.
 */
export function normalizarDiasManuales(days: unknown): number | null | 'invalido' {
  if (days === undefined || days === null) return null;
  if (typeof days === 'number') {
    if (!Number.isFinite(days) || days < 0) return 'invalido';
    return Math.min(TECHO_DIAS, Math.max(PISO_DIAS, Math.floor(days)));
  }
  if (typeof days === 'string' && /^\d+$/.test(days.trim())) return llevarAlRango(days.trim());
  return 'invalido';
}

/**
 * De dónde salió el número de días de una lectura:
 *   - `omision`: no hay fila (o no se pudo leer y no había otro número); rige `RETENCION_POR_OMISION_DIAS`.
 *   - `configurado`: la fila existe y es un entero.
 *   - `conservado`: la fila no se puede interpretar (o la base falló) y se usa el último número válido que se leyó.
 *   - `invalido`: la fila no se puede interpretar y nunca se leyó un número válido: `dias` es `null` y no se borra nada.
 */
export type OrigenRetencion = 'omision' | 'configurado' | 'conservado' | 'invalido';

export type LecturaRetencion =
  | { dias: number; origen: 'omision' | 'configurado' | 'conservado' }
  | { dias: null; origen: 'invalido' };

/** Texto sencillo para el log de la purga (o para quien llama a mano). */
export function describirOrigenRetencion(origen: OrigenRetencion | 'manual'): string {
  switch (origen) {
    case 'manual':
      return 'días pedidos en la llamada';
    case 'omision':
      return 'por omisión: nadie ha fijado otro número';
    case 'configurado':
      return 'configurado en system_settings';
    case 'conservado':
      return 'conservado: la fila configurada no se puede leer y se usa el último número válido';
    case 'invalido':
      return 'la fila configurada no se puede leer y no hay un número válido anterior';
  }
}

const logger = new Logger('RetencionBitacora');

/** Cómo arreglar una fila ilegible (va en el aviso del log y en el error de la purga). */
export const COMO_CORREGIR_RETENCION =
  `Se corrige con apps/api/scripts/set-retencion-bitacora.sql o con PUT /api/settings (clave ${CLAVE_RETENCION_BITACORA}, ` +
  `valor en días, por ejemplo 180).`;

let cache: { lectura: LecturaRetencion; leidoAt: number } | null = null;
/** Último número VÁLIDO leído de la base. No vence con la caché: es el respaldo cuando la fila queda ilegible. */
let ultimoValido: number | null = null;
let enVuelo: Promise<LecturaRetencion> | null = null;

/** Cómo se dice el valor ilegible en el log: nunca el valor mismo, solo su forma. */
const formaDelValor = (valor: unknown) =>
  typeof valor === 'string' ? `un texto de ${valor.length} caracteres` : 'algo que no es texto';

async function consultar(prisma: LectorRetencion, ahora: number): Promise<LecturaRetencion> {
  try {
    const fila = await prisma.systemSetting.findFirst({
      where: { key: CLAVE_RETENCION_BITACORA },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: { value: true },
    });

    let lectura: LecturaRetencion;
    if (!fila) {
      ultimoValido = RETENCION_POR_OMISION_DIAS;
      lectura = { dias: RETENCION_POR_OMISION_DIAS, origen: 'omision' };
    } else {
      const dias = interpretarRetencionDias(fila.value);
      if (dias !== null) {
        ultimoValido = dias;
        lectura = { dias, origen: 'configurado' };
      } else if (ultimoValido !== null) {
        lectura = { dias: ultimoValido, origen: 'conservado' };
        logger.warn(
          `La retención de la bitácora (system_settings «${CLAVE_RETENCION_BITACORA}») guarda ${formaDelValor(fila.value)} ` +
            `que no es un número entero de días. Se conserva el último número válido: ${ultimoValido} días. ${COMO_CORREGIR_RETENCION}`,
        );
      } else {
        lectura = { dias: null, origen: 'invalido' };
        logger.warn(
          `La retención de la bitácora (system_settings «${CLAVE_RETENCION_BITACORA}») guarda ${formaDelValor(fila.value)} ` +
            `que no es un número entero de días y no hay un número válido anterior: la purga NO borra nada hasta que se ` +
            `corrija. ${COMO_CORREGIR_RETENCION}`,
        );
      }
    }
    cache = { lectura, leidoAt: ahora };
    return lectura;
  } catch (error) {
    // Base caída o cliente sin `systemSetting`: se conserva el último número válido (para no borrar más de lo que Adam
    // fijó) y, si nunca hubo uno, el de omisión. Nunca lanza. No se guarda en caché: la siguiente llamada vuelve a intentar.
    const motivo = error instanceof Error ? error.name : 'error';
    if (ultimoValido !== null) {
      logger.warn(`No se pudo leer la retención de la bitácora (${motivo}). Se conserva el último número válido: ${ultimoValido} días.`);
      return { dias: ultimoValido, origen: 'conservado' };
    }
    logger.warn(
      `No se pudo leer la retención de la bitácora (${motivo}). Se usa la de omisión: ${RETENCION_POR_OMISION_DIAS} días.`,
    );
    return { dias: RETENCION_POR_OMISION_DIAS, origen: 'omision' };
  }
}

/**
 * Retención vigente y de dónde salió. Caché de 5 minutos por proceso (también cuando la fila es ilegible, para no
 * repetir el aviso en cada llamada); dos lecturas simultáneas comparten una sola consulta. Nunca lanza.
 * `ahora` solo existe para las pruebas.
 */
export async function leerRetencionDias(prisma: LectorRetencion, ahora: number = Date.now()): Promise<LecturaRetencion> {
  if (cache) {
    const edad = ahora - cache.leidoAt;
    if (edad >= 0 && edad < CACHE_RETENCION_MS) return cache.lectura;
  }
  if (!enVuelo) {
    enVuelo = consultar(prisma, ahora).finally(() => {
      enVuelo = null;
    });
  }
  return enVuelo;
}

/** Solo para pruebas: olvida lo leído. */
export function reiniciarCacheRetencion(): void {
  cache = null;
  ultimoValido = null;
  enVuelo = null;
}
