import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  FOLIO_SERIES,
  assertIdentificadorSeguro,
  formatFolio,
  resolvePrefijo,
  type SerieKey,
} from './folio-series.js';

/**
 * Folios consecutivos por empresa y serie.
 *
 * Sustituye a los once `count() + 1` que había repartidos por el código. Aquel
 * patrón fallaba de dos maneras, y la segunda era una caída completa:
 *
 *   1. **Concurrencia.** Dos altas simultáneas leían el mismo `count` y pedían
 *      el mismo folio; la segunda moría contra el índice único con un 500 sin
 *      explicación.
 *
 *   2. **Borrado suave.** En `Invoice` y `PurchaseOrder` el middleware añade
 *      `deletedAt: null` a las lecturas —`count` incluido—, así que borrar una
 *      factura hacía **retroceder** el contador y el siguiente folio chocaba
 *      con uno que seguía existiendo en la tabla. No se recuperaba solo: cada
 *      intento posterior generaba el mismo número y fallaba igual. Facturación
 *      quedaba muerta hasta que alguien lo notara.
 *
 * Aquí el consecutivo se incrementa con una sola sentencia atómica, de modo que
 * ni la concurrencia ni los borrados lo mueven hacia atrás.
 */
@Injectable()
export class FolioService {
  private readonly logger = new Logger(FolioService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Siguiente folio de la serie.
   *
   * Camino rápido: un `UPDATE ... RETURNING` sobre el contador. Si la empresa
   * todavía no tiene contador para esa serie, se siembra desde el máximo que ya
   * exista en la tabla destino —**incluidos los borrados**, que es justo lo que
   * el patrón anterior no miraba— y el `ON CONFLICT` resuelve el empate si dos
   * peticiones siembran a la vez.
   */
  async next(serie: SerieKey, companyId: number, at: Date = new Date()): Promise<string> {
    if (!Number.isInteger(companyId) || companyId <= 0) {
      throw new Error('Se requiere una empresa válida para generar folio');
    }
    const prefijo = resolvePrefijo(serie, at);

    const incrementado = await this.prisma.$queryRaw<Array<{ valor: number }>>`
      UPDATE folio_counters
         SET valor = valor + 1, "updatedAt" = NOW()
       WHERE "companyId" = ${companyId} AND serie = ${prefijo}
      RETURNING valor
    `;
    if (incrementado[0]) return formatFolio(serie, Number(incrementado[0].valor), at);

    const semilla = await this.maxExistente(serie, companyId, prefijo);
    const sembrado = await this.prisma.$queryRaw<Array<{ valor: number }>>`
      INSERT INTO folio_counters ("companyId", serie, valor, "updatedAt")
      VALUES (${companyId}, ${prefijo}, ${semilla + 1}, NOW())
      ON CONFLICT ("companyId", serie)
      DO UPDATE SET valor = folio_counters.valor + 1, "updatedAt" = NOW()
      RETURNING valor
    `;

    const valor = Number(sembrado[0]?.valor ?? semilla + 1);
    this.logger.log(
      `Contador de folios iniciado: empresa=${companyId} serie=${prefijo} desde=${semilla} → ${valor}`,
    );
    return formatFolio(serie, valor, at);
  }

  /**
   * Mayor consecutivo que ya existe en la tabla destino.
   *
   * Va en SQL crudo a propósito: así **no** pasa por el middleware de borrado
   * suave y ve también las filas borradas. Si sólo mirara las vivas, sembraría
   * repitiendo folios ya emitidos, que es exactamente el fallo que esto viene a
   * corregir.
   */
  private async maxExistente(serie: SerieKey, companyId: number, prefijo: string): Promise<number> {
    const def = FOLIO_SERIES[serie];
    const tabla = Prisma.raw(`"${assertIdentificadorSeguro(def.tabla)}"`);
    const columna = Prisma.raw(`"${assertIdentificadorSeguro(def.columna)}"`);

    const filas = await this.prisma.$queryRaw<Array<{ max: number | null }>>`
      SELECT COALESCE(MAX(CAST(substring(${columna} FROM '(\d+)$') AS INTEGER)), 0) AS max
        FROM ${tabla}
       WHERE "companyId" = ${companyId}
         AND ${columna} LIKE ${prefijo + '%'}
         AND ${columna} ~ '\d+$'
    `;
    return Number(filas[0]?.max ?? 0);
  }

  /**
   * Reserva el folio y lo entrega ya formateado, reintentando si aun así choca.
   *
   * El contador no colisiona por sí solo, pero un folio puede haberse escrito a
   * mano desde otra vía (importación, corrección manual). En vez de devolver un
   * 500 opaco, se avanza al siguiente hueco.
   */
  async nextDisponible(
    serie: SerieKey,
    companyId: number,
    existe: (folio: string) => Promise<boolean>,
    intentos = 5,
  ): Promise<string> {
    for (let i = 0; i < intentos; i++) {
      const folio = await this.next(serie, companyId);
      if (!(await existe(folio))) return folio;
      this.logger.warn(`Folio ${folio} ya ocupado (empresa=${companyId}); avanzando el contador`);
    }
    throw new Error(
      `No se pudo obtener un folio libre de la serie ${serie} tras ${intentos} intentos`,
    );
  }
}
