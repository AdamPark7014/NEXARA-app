import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { armarCatalogo, type CatalogoDeHoy, type FilaCt } from './costo-de-hoy.js';

const logger = new Logger('CostoDeHoy');

/**
 * Lo que CT dice hoy de estos modelos. Es una sola consulta, sin IA, y corre en cada búsqueda de
 * «Nueva partida»: las expresiones deben quedar igual que las de los índices de
 * `20261102190000_productos_ct_modelo_normalizado` y `20261102193000_productos_ct_tipo_del_dia`, o
 * vuelve a recorrer el catálogo. Si falla, la propuesta sale sin aviso: no vale perder lo armado.
 */
export async function leerCatalogoDeHoy(db: Pick<PrismaService, '$queryRaw' | 'supplierCatalogSyncRun'>, modelos: string[]): Promise<CatalogoDeHoy | null> {
  if (!modelos.length) return null;
  try {
    const [filas, corrida] = await Promise.all([
      db.$queryRaw<Array<FilaCt & { tipoDelDia: number | null }>>`
        SELECT clave, modelo, "numParte", precio, moneda, "tipoCambio", existencia,
          (SELECT "tipoCambio" FROM productos_ct WHERE activo AND upper(moneda) = 'USD' ORDER BY "updatedAt" DESC LIMIT 1) AS "tipoDelDia"
        FROM productos_ct
        WHERE activo AND (
          regexp_replace(upper(coalesce(modelo, '')), '[^A-Z0-9]', '', 'g') = ANY(${modelos}::text[])
          OR regexp_replace(upper(coalesce("numParte", '')), '[^A-Z0-9]', '', 'g') = ANY(${modelos}::text[])
          OR upper(clave) = ANY(${modelos}::text[])
        )`,
      db.supplierCatalogSyncRun.findFirst({
        where: { supplierCode: 'CT', status: 'OK' },
        orderBy: { startedAt: 'desc' },
        select: { finishedAt: true },
      }),
    ]);
    return armarCatalogo(filas, filas[0]?.tipoDelDia ?? null, corrida?.finishedAt ?? null);
  } catch (e) {
    logger.warn(`Sin costos de CT: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
