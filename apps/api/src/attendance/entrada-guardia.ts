import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { workDayBounds, workDateColumn } from '../common/time/workday.js';
import { companyWhere } from '../common/tenant/tenant-scope.js';
import { TIPOS_QUE_ABREN_JORNADA, diaDeGuardia } from '../guardias/guardias-reglas.js';
import { evaluarUbicacion } from './asistencia-confiable.js';

const logger = new Logger('EntradaGuardia');

/** Lo mínimo de Prisma que usa (así la llama quien solo tiene `prisma`). */
type Db = { [modelo: string]: any };

export type EntradaDeGuardia =
  | { creada: true; attendanceId: number; deviceInfo: string; nombre: string | null }
  | { creada: false };

const NO: EntradaDeGuardia = { creada: false };

/**
 * Entrada de quien tiene guardia: sale sola al iniciar su primer servicio o tarea del
 * sábado o domingo, con la hora y la ubicación de ese inicio (la foto de entrada de la
 * actividad también es la de la checada).
 *
 * No hace nada si no es fin de semana, si no tiene guardia, si la actividad no es servicio
 * ni tarea, o si ya checó entrada ese día. Si arrastra una jornada abierta (de otro día o
 * de hoy) tampoco: esa se resuelve desde la app, que la cierra antes de abrir la nueva.
 *
 * Nunca lanza: el inicio de la actividad ya quedó guardado y no se cae por esto.
 */
export async function abrirJornadaDeGuardia(
  db: Db,
  p: {
    userId: number;
    companyId: number;
    activityId: number;
    at: Date;
    latitude?: number | null;
    longitude?: number | null;
    photoUrl?: string | null;
  },
): Promise<EntradaDeGuardia> {
  try {
    if ((await diaDeGuardia(db, { userId: p.userId, companyId: p.companyId, at: p.at })) !== 'CON_GUARDIA') {
      return NO;
    }

    const actividad = await db.activity.findFirst({
      where: { id: p.activityId, ...companyWhere(p.companyId) },
      select: { coreKind: true, titulo: true },
    });
    if (!actividad || !(TIPOS_QUE_ABREN_JORNADA as readonly string[]).includes(String(actividad.coreKind ?? ''))) {
      return NO;
    }

    const { start, end } = workDayBounds(p.at);
    const yaEntro = await db.attendance.findFirst({
      where: { userId: p.userId, type: 'entrada', timestamp: { gte: start, lte: end }, ...companyWhere(p.companyId) },
      select: { id: true },
    });
    if (yaEntro) return NO;
    const abierta = await db.attendanceDay.findFirst({
      where: { userId: p.userId, isOpen: true, ...companyWhere(p.companyId) },
      select: { id: true },
    });
    if (abierta) return NO;

    const lat = Number(p.latitude);
    const lng = Number(p.longitude);
    const coords =
      p.latitude != null &&
      p.longitude != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      !(lat === 0 && lng === 0) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
        ? { latitude: lat, longitude: lng }
        : null;
    // Con guardia no hay geocerca de oficina: solo cuenta que haya ubicación.
    const ubicacion = evaluarUbicacion({ coords, sitios: [] });
    const titulo = String(actividad.titulo ?? '').trim();
    const deviceInfo = `Entrada automática por guardia · inicio de ${titulo ? `«${titulo.slice(0, 120)}»` : 'su actividad'}`;
    const dia = workDateColumn(p.at);

    let checada: { id: number; user?: { nombre?: string | null } | null };
    try {
      checada = await db.attendance.create({
        data: {
          userId: p.userId,
          type: 'entrada',
          timestamp: p.at,
          workDate: dia,
          deviceInfo,
          photoUrl: p.photoUrl || null,
          entryLatitude: coords?.latitude ?? null,
          entryLongitude: coords?.longitude ?? null,
          validacion: ubicacion.validacion,
          motivoValidacion: ubicacion.motivo,
          fueraDeSitio: false,
          distanciaSitioM: null,
          sitioNombre: null,
          offline: false,
          cierreAutomatico: false,
          companyId: p.companyId,
        },
        select: { id: true, user: { select: { nombre: true } } },
      });
    } catch (error) {
      // Checó desde la app al mismo tiempo: gana la suya.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return NO;
      throw error;
    }

    await db.attendanceDay.upsert({
      where: { companyId_userId_date: { companyId: p.companyId, userId: p.userId, date: dia } },
      create: {
        userId: p.userId,
        date: dia,
        totalMinutes: 0,
        lastEntryAt: p.at,
        isOpen: true,
        companyId: p.companyId,
      },
      update: { lastEntryAt: p.at, isOpen: true },
    });

    return { creada: true, attendanceId: checada.id, deviceInfo, nombre: checada.user?.nombre ?? null };
  } catch (error) {
    logger.warn(`abrirJornadaDeGuardia ${p.activityId}/${p.userId}: ${String(error)}`);
    return NO;
  }
}
