import { BadRequestException } from '@nestjs/common';

/**
 * Comprueba que las referencias enviadas en una petición son de la empresa.
 *
 * El aislamiento por empresa vive en un middleware que inyecta `companyId` en
 * los `where` de las consultas. Un `create`, en cambio, escribe las claves
 * foráneas tal cual: si `clientId` llega del cuerpo de la petición, nadie mira
 * de quién es ese cliente. El resultado es una factura de la empresa A
 * apuntando a un cliente de la B —y, probando ids, un modo de averiguar qué
 * existe en la otra empresa.
 *
 * Esto se comprueba en bloque: una consulta por modelo, no una por referencia.
 */

/** Lo mínimo que se necesita de un delegado de Prisma para comprobar. */
type Consultable = {
  findMany(args: {
    where: { id: { in: number[] }; companyId: number };
    select: { id: true };
  }): Promise<Array<{ id: number }>>;
};

export type Referencia = {
  /** Delegado de Prisma: `prisma.account`, `prisma.salesClient`… */
  modelo: Consultable;
  /** Ids a comprobar; los nulos y repetidos se ignoran. */
  ids: Array<number | null | undefined>;
  /** Cómo nombrarlo en el error: "Cuenta contable", "Cliente"… */
  etiqueta: string;
};

/**
 * Lanza si alguna referencia no existe **en esa empresa**.
 *
 * El mensaje no distingue "no existe" de "es de otra empresa": distinguirlo
 * convertiría el error en un buscador de los datos ajenos.
 */
export async function assertRefsBelongToCompany(
  companyId: number,
  referencias: Referencia[],
): Promise<void> {
  const pendientes = referencias
    .map((r) => ({
      ...r,
      unicos: [...new Set(r.ids.filter((id): id is number => Number.isInteger(id) && (id as number) > 0))],
    }))
    .filter((r) => r.unicos.length > 0);

  if (pendientes.length === 0) return;

  const resultados = await Promise.all(
    pendientes.map((r) =>
      r.modelo.findMany({ where: { id: { in: r.unicos }, companyId }, select: { id: true } }),
    ),
  );

  for (let i = 0; i < pendientes.length; i++) {
    const { unicos, etiqueta } = pendientes[i];
    const encontrados = new Set(resultados[i].map((f) => f.id));
    const ajenos = unicos.filter((id) => !encontrados.has(id));
    if (ajenos.length > 0) {
      throw new BadRequestException(
        `${etiqueta} no disponible en esta empresa: ${ajenos.join(', ')}`,
      );
    }
  }
}
