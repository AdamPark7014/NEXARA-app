/**
 * Un cliente al que se le abre un proyecto es un cliente de proyecto.
 *
 * El proyecto se liga al cliente de operación (`ServiceClient`); el padrón que se ve en
 * Clientes es `SalesClient`. Al crear un proyecto se deja al cliente del padrón con el tipo
 * PROYECTO (sin quitarle los que ya tenga) para que aparezca en «Clientes de proyecto» y
 * en los selectores, venga de donde venga: del padrón, de una cotización o del alta
 * rápida de una actividad. Si el cliente de operación no tenía ficha en el padrón
 * (altas viejas), se le crea una mínima: así no quedan proyectos de clientes que no
 * existen en Clientes.
 */

type ClienteDelPadron = {
  id: number;
  tipo?: string | null;
  companyId: number;
  sectors?: Array<{ sector: string }> | null;
};

type PrismaDeClientes = {
  salesClient: {
    findMany(args: unknown): Promise<ClienteDelPadron[]>;
    create(args: unknown): Promise<unknown>;
  };
  salesClientSector: { create(args: unknown): Promise<unknown> };
  serviceClient: {
    findUnique(args: unknown): Promise<{
      id: number;
      name: string;
      contactEmail?: string | null;
      contactPhone?: string | null;
      address?: string | null;
      isActive?: boolean | null;
      companyId: number;
    } | null>;
  };
};

export async function marcarClienteDeProyecto(
  prisma: unknown,
  serviceClientId: number,
  actorId?: number | null,
): Promise<void> {
  const db = prisma as PrismaDeClientes;
  const delPadron = await db.salesClient.findMany({
    where: { serviceClientId },
    select: { id: true, tipo: true, companyId: true, sectors: { select: { sector: true } } },
  });

  if (!delPadron.length) {
    const operacion = await db.serviceClient.findUnique({ where: { id: serviceClientId } });
    if (!operacion) return;
    await db.salesClient.create({
      data: {
        name: operacion.name,
        billingEmail: operacion.contactEmail ?? null,
        billingPhone: operacion.contactPhone ?? null,
        fiscalAddress: operacion.address ?? null,
        status: operacion.isActive === false ? 'Inactivo' : 'Activo',
        ownerId: actorId ?? null,
        serviceClientId: operacion.id,
        companyId: operacion.companyId,
        tipo: 'PROYECTO',
        sectors: { create: [{ sector: 'PROYECTO', companyId: operacion.companyId }] },
      },
    });
    return;
  }

  for (const cliente of delPadron) {
    if ((cliente.sectors ?? []).some((s) => s.sector === 'PROYECTO')) continue;
    await db.salesClientSector.create({
      data: { salesClientId: cliente.id, sector: 'PROYECTO', companyId: cliente.companyId },
    });
  }
}

/**
 * Lo mismo, sin tumbar el alta del proyecto: el proyecto ya existe y es lo que importa.
 * Si la marca falla, el cliente se puede sumar a Proyecto desde su ficha.
 */
export async function marcarClienteDeProyectoSinFallar(
  prisma: unknown,
  serviceClientId: number,
  actorId?: number | null,
): Promise<void> {
  try {
    await marcarClienteDeProyecto(prisma, serviceClientId, actorId);
  } catch {
    /* el proyecto ya está creado */
  }
}
