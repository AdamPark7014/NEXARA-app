/**
 * Interruptor de la captura guiada (`system_settings` → `vehiculos.captura_guiada`), apagado por omisión.
 *
 * Apagado, todo sigue como hoy: se acepta el checklist de 7 fotos y la salida de inventario no pide
 * actividad. Prendido:
 *   - las salidas (solicitud e inventario) solo con la captura de 5 pasos; las devoluciones aceptan las
 *     dos, para que nadie se quede con la unidad por traer la app vieja;
 *   - sacar una unidad del inventario pide actividad, y pedir una no se puede para una actividad cerrada;
 *   - corren los avisos de devolución tardía.
 */
export const CLAVE_CAPTURA_GUIADA = 'vehiculos.captura_guiada';

const VALORES_PRENDIDO = ['true', '1', 'si', 'sí'];
const CACHE_MS = 30_000;

let cache: { valor: boolean; leidoAt: number } | null = null;

type LectorSettings = {
  systemSetting?: { findFirst: (args: any) => Promise<{ id: number } | null> };
};

/** ¿Está prendida? Con caché de 30 s. Si la base falla, se queda como estaba (o apagada). */
export async function capturaGuiadaPrendida(prisma: LectorSettings, ahora = Date.now()): Promise<boolean> {
  if (cache && ahora - cache.leidoAt < CACHE_MS) return cache.valor;
  try {
    if (!prisma?.systemSetting?.findFirst) return cache?.valor ?? false;
    const fila = await prisma.systemSetting.findFirst({
      where: { key: CLAVE_CAPTURA_GUIADA, value: { in: VALORES_PRENDIDO } },
      select: { id: true },
    });
    cache = { valor: Boolean(fila), leidoAt: ahora };
  } catch {
    return cache?.valor ?? false;
  }
  return cache.valor;
}

/** Solo para pruebas. */
export function reiniciarCacheInterruptor(): void {
  cache = null;
}
