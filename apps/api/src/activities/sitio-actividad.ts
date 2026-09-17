import { distanciaM, puntoReal, type Punto } from './geofence/geocerca.js';

/** Sitio donde debería hacerse la actividad (sucursal del cliente o punto del ticket). */
export type SitioActividad = { punto: Punto; nombre: string | null };

type PrismaLike = {
  serviceClientBranch: {
    findFirst: (args: unknown) => Promise<{
      name: string | null;
      latitud: unknown;
      longitud: unknown;
    } | null>;
  };
  clientTicketRequest: {
    findFirst: (args: unknown) => Promise<{
      branchName: string | null;
      latitud: unknown;
      longitud: unknown;
    } | null>;
  };
};

/**
 * Coordenadas del sitio de una actividad. Primero la sucursal del cliente
 * (por número, si no por nombre) y, si no tiene coordenadas, el punto que mandó
 * el cliente al levantar el ticket. `null` cuando nadie tiene coordenadas: sin
 * sitio conocido no se mide distancia y nada se bloquea.
 */
export async function sitioDeActividad(
  prisma: PrismaLike,
  activity: {
    id: number;
    clientId?: number | null;
    branchNumber?: string | null;
    branchName?: string | null;
  },
): Promise<SitioActividad | null> {
  if (activity.clientId) {
    const where = activity.branchNumber
      ? { clientId: activity.clientId, branchNumber: activity.branchNumber }
      : activity.branchName
        ? { clientId: activity.clientId, name: activity.branchName }
        : { clientId: activity.clientId };
    const branch = await prisma.serviceClientBranch.findFirst({
      where: { ...where, latitud: { not: null }, longitud: { not: null } },
      select: { name: true, latitud: true, longitud: true },
    });
    const punto = branch ? puntoReal(branch.latitud, branch.longitud) : null;
    if (punto) return { punto, nombre: branch?.name ?? activity.branchName ?? null };
  }

  const ticket = await prisma.clientTicketRequest.findFirst({
    where: { activityId: activity.id, latitud: { not: null }, longitud: { not: null } },
    select: { branchName: true, latitud: true, longitud: true },
  });
  const puntoTicket = ticket ? puntoReal(ticket.latitud, ticket.longitud) : null;
  if (puntoTicket) return { punto: puntoTicket, nombre: ticket?.branchName ?? activity.branchName ?? null };

  return null;
}

/** Metros entre donde tomó la foto de entrada y el sitio; null si falta alguno de los dos. */
export function distanciaAlSitio(sitio: SitioActividad | null, lat: unknown, lng: unknown): number | null {
  const punto = puntoReal(lat, lng);
  if (!sitio || !punto) return null;
  return distanciaM(sitio.punto, punto);
}
