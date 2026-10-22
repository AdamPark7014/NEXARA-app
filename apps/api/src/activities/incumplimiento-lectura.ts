/**
 * Lectura de los registros de incumplimiento para el detalle, el historial y las apps.
 * Aparte del servicio para que el detalle y la línea de tiempo la usen sin depender de él.
 */
import { companyWhere } from '../common/tenant/tenant-scope.js';
import { etiquetaCausa, type OrigenIncumplimiento } from './incumplimiento.js';

/** Registro de incumplimiento tal como lo ven la web y las apps. */
export type IncumplimientoDto = {
  id: number;
  origen: OrigenIncumplimiento;
  causa: string;
  causaEtiqueta: string;
  observaciones: string | null;
  limite: string | null;
  registradoAt: string;
  /** null = el sistema, al cierre de la jornada. */
  registradoPor: { id: number; nombre: string } | null;
  pendientes: Array<{ id: number; nombre: string }>;
  reprogramadaAt: string | null;
  reprogramadaPara: string | null;
  reprogramadaPor: { id: number; nombre: string } | null;
  motivoReprogramacion: string | null;
};

/**
 * Incumplimientos de una actividad, el más reciente primero, con los nombres resueltos. Un cliente
 * Prisma sin la tabla (pruebas con mock, migración pendiente) devuelve nada.
 */
export async function leerIncumplimientos(
  prismaClient: unknown,
  activityId: number,
  companyId: number | null | undefined,
  take = 20,
): Promise<IncumplimientoDto[]> {
  const prisma = prismaClient as any;
  if (typeof prisma?.activityNonCompliance?.findMany !== 'function') return [];
  try {
    const filas = await prisma.activityNonCompliance.findMany({
      where: { activityId, ...companyWhere(companyId ?? null) },
      orderBy: { registradoAt: 'desc' },
      take,
      include: {
        registradoPor: { select: { id: true, nombre: true } },
        reprogramadaPor: { select: { id: true, nombre: true } },
      },
    });
    const ids = [...new Set<number>(filas.flatMap((f: any) => f.pendientesIds ?? []))];
    const usuarios: Array<{ id: number; nombre: string | null }> = ids.length
      ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } })
      : [];
    const nombres = new Map(usuarios.map((u) => [u.id, u.nombre ?? 'Sin nombre']));
    return filas.map((f: any) => ({
      id: f.id,
      origen: f.origen as OrigenIncumplimiento,
      causa: f.causa,
      causaEtiqueta: etiquetaCausa(f.causa),
      observaciones: f.observaciones ?? null,
      limite: f.limite ? new Date(f.limite).toISOString() : null,
      registradoAt: new Date(f.registradoAt).toISOString(),
      registradoPor: f.registradoPor ? { id: f.registradoPor.id, nombre: f.registradoPor.nombre } : null,
      pendientes: (f.pendientesIds ?? []).map((id: number) => ({ id, nombre: nombres.get(id) ?? 'Sin nombre' })),
      reprogramadaAt: f.reprogramadaAt ? new Date(f.reprogramadaAt).toISOString() : null,
      reprogramadaPara: f.reprogramadaPara ? new Date(f.reprogramadaPara).toISOString() : null,
      reprogramadaPor: f.reprogramadaPor ? { id: f.reprogramadaPor.id, nombre: f.reprogramadaPor.nombre } : null,
      motivoReprogramacion: f.motivoReprogramacion ?? null,
    }));
  } catch {
    return [];
  }
}
