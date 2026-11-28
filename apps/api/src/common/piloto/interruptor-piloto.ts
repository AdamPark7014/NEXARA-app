/**
 * El interruptor ÚNICO del Piloto (`system_settings`), con tres posiciones:
 *
 *   - `apagado`  : la función no hace nada. Es la posición de fábrica.
 *   - `observar` : la función calcula lo que haría y lo deja en el log, pero NO avisa ni escribe.
 *   - `activo`   : la función hace su trabajo.
 *
 * Todo lo nuevo del Piloto (avisos, escaladas, compuerta de IA, vigilantes…) nace apagado y se enciende con el mismo
 * gesto, sin desplegar: un `PUT /api/settings` con `{ key, value, category: 'piloto' }` (permiso CONSOLE_ADMIN).
 * El efecto llega en menos de 30 s en cada contenedor, que es lo que dura la caché.
 *
 * Qué se guarda en la fila (`value`), sin importar mayúsculas, espacios ni acentos:
 *   - activo   : `activo`, `on`, `true`, `1`, `si`, `sí`, `encendido`, `prendido`
 *   - observar : `observar`, `observa`, `observacion`
 *   - apagado  : `apagado`, `off`, `false`, `0`, `no`, `desactivado`, `inactivo`
 *   - cualquier otra cosa, o fila ausente: el valor por omisión de quien llama (`apagado` si no pide otro).
 *
 * POR QUÉ NO SE MIRA LA EMPRESA (léelo antes de tocar el `where`)
 * ---------------------------------------------------------------
 * `PUT /api/settings` guarda la fila con la empresa de quien llama (`SettingsService.upsert`): la que enciende Adam
 * queda con `companyId` de SU empresa, no con `companyId` nulo. Y `SettingsService.getValue` (empresa gana a plataforma)
 * necesita saber la empresa de la petición. Un interruptor del Piloto lo consultan también los cron y los timers
 * (`@Cron`, `setInterval`, arranque del módulo), que corren fuera de una petición: no tienen empresa y el
 * middleware de Prisma tampoco los acota. Un lector que pidiera `companyId: null` jamás vería la fila de Adam, y uno que
 * pidiera una empresa no serviría a un timer. Por eso este lector, igual que `vehicles/interruptor-vehiculos.ts`
 * (que NO se toca), busca CUALQUIER fila con esa clave, de plataforma o de empresa. `SystemSetting` no está en
 * `TENANT_SCOPED_MODELS` (lo vigila `common/tenant/system-settings-tenant.spec.ts`), así que la consulta ve todas.
 *
 * Es un interruptor del PROCESO, no de una empresa. Si algún día hubiera que encender algo solo para una empresa,
 * ese ajuste no es de este lector: sería otra clave leída con `SettingsService.getValue(clave, companyId)`.
 *
 * Si hay varias filas con la misma clave (p. ej. una de plataforma y otra de la empresa de Adam) manda la que se
 * tocó más recientemente (`updatedAt`, y a igualdad la de mayor `id`): la última decisión de Adam gana, también la de
 * apagar. Lo normal es una sola fila por clave.
 *
 * Caché y fallos
 * --------------
 * Caché de 30 s por clave y por proceso. Dos lecturas simultáneas de la misma clave comparten una sola consulta.
 * Si la base falla se devuelve el último valor leído (o el valor por omisión si nunca se leyó) y no se vuelve a
 * insistir hasta pasados otros 30 s, para no martillar una base enferma. Un interruptor jamás lanza.
 */

export type ModoPiloto = 'apagado' | 'observar' | 'activo';

export const MODOS_PILOTO: readonly ModoPiloto[] = ['apagado', 'observar', 'activo'];

/** Claves de los interruptores de la Ola 1 (`category: 'piloto'`). Las de otros paquetes viven en su propio archivo. */
export const CLAVES_PILOTO = {
  CONTRATOS_SIN_RESPONSABLE: 'piloto.contratos.aviso_sin_responsable',
  EVIDENCIAS_ESCALADA: 'piloto.evidencias.escalada_ampliada',
  CONTACTOS_AVISOS: 'piloto.contactos.avisos',
  CRM_RECORDATORIOS: 'piloto.crm.recordatorios',
  VEHICULOS_VENCIMIENTOS: 'piloto.vehiculos.vencimientos',
} as const;

export type ClavePiloto = (typeof CLAVES_PILOTO)[keyof typeof CLAVES_PILOTO];

/** Cuánto vale una lectura antes de volver a preguntarle a la base. */
export const CACHE_PILOTO_MS = 30_000;

const VALORES_ACTIVO = new Set(['activo', 'on', 'true', '1', 'si', 'encendido', 'prendido']);
const VALORES_OBSERVAR = new Set(['observar', 'observa', 'observacion']);
const VALORES_APAGADO = new Set(['apagado', 'off', 'false', '0', 'no', 'desactivado', 'inactivo']);

/**
 * Lo mínimo que se necesita de Prisma. `PrismaService` lo cumple tal cual; en pruebas basta un objeto con
 * `systemSetting.findFirst`.
 */
export type LectorSettings = {
  systemSetting: {
    findFirst(args: any): Promise<{ value: string } | null>;
  };
};

/**
 * Traduce el texto guardado a un modo. `null` = no lo reconozco (vacío, basura, faltante): decide quien llama con su
 * valor por omisión.
 */
export function interpretarModoPiloto(valor: unknown): ModoPiloto | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (VALORES_ACTIVO.has(limpio)) return 'activo';
  if (VALORES_OBSERVAR.has(limpio)) return 'observar';
  if (VALORES_APAGADO.has(limpio)) return 'apagado';
  return null;
}

/** `null` = la base no tiene fila (o no se pudo leer nunca) con valor entendible. */
type Lectura = { modo: ModoPiloto | null; leidoAt: number };

const cache = new Map<string, Lectura>();
const enVuelo = new Map<string, Promise<ModoPiloto | null>>();

async function consultar(prisma: LectorSettings, clave: string, ahora: number): Promise<ModoPiloto | null> {
  try {
    const fila = await prisma.systemSetting.findFirst({
      where: { key: clave },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: { value: true },
    });
    // Hay fila pero no se entiende (un error de dedo): se apaga. Así un llamador cuya omisión sea «activo» nunca se
    // enciende por un valor mal escrito; solo la AUSENCIA de fila deja decidir a quien llama.
    const modo = fila ? (interpretarModoPiloto(fila.value) ?? 'apagado') : null;
    cache.set(clave, { modo, leidoAt: ahora });
    return modo;
  } catch {
    // Base caída o cliente sin `systemSetting`: se conserva lo último que se supo y se espera otros 30 s.
    const previo = cache.get(clave)?.modo ?? null;
    cache.set(clave, { modo: previo, leidoAt: ahora });
    return previo;
  }
}

/**
 * Posición actual del interruptor `clave`. Sin fila devuelve `porOmision`, que por omisión es `apagado`. Con una
 * fila cuyo valor no se entiende devuelve siempre `apagado`, pida lo que pida quien llama. No necesita empresa ni
 * petición: sirve igual desde un servicio, un cron o un timer.
 * `ahora` solo existe para las pruebas.
 */
export async function leerModoPiloto(
  prisma: LectorSettings,
  clave: string,
  porOmision: ModoPiloto = 'apagado',
  ahora: number = Date.now(),
): Promise<ModoPiloto> {
  const guardada = cache.get(clave);
  if (guardada) {
    const edad = ahora - guardada.leidoAt;
    if (edad >= 0 && edad < CACHE_PILOTO_MS) return guardada.modo ?? porOmision;
  }
  let pendiente = enVuelo.get(clave);
  if (!pendiente) {
    pendiente = consultar(prisma, clave, ahora).finally(() => enVuelo.delete(clave));
    enVuelo.set(clave, pendiente);
  }
  return (await pendiente) ?? porOmision;
}

/** Solo para pruebas: olvida lo leído. */
export function reiniciarCachePiloto(): void {
  cache.clear();
  enVuelo.clear();
}
