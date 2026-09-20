import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { workDateColumn, parseWorkDate } from '../common/time/workday.js';
import { TeamBoardService } from './team-board.service.js';
import { KpisEquipoService } from './kpis-equipo.service.js';
import { horaValida, type EstadoExtra } from './kpis-equipo.js';

type Viewer = { id: number; roleKey?: string | null; email?: string | null; isSuperAdmin?: boolean };

const ESTADOS: readonly EstadoExtra[] = ['PENDIENTE', 'APROBADO', 'RECHAZADO'];

/** Una decisión sobre el tiempo extra de una persona en un día. */
export type DecisionExtra = {
  userId: number;
  /** `AAAA-MM-DD`. */
  fecha: string;
  minutos: number;
  estado: EstadoExtra;
  nota: string | null;
  aprobadoPor: { id: number; nombre: string } | null;
  at: string;
};

/**
 * Horas extra: el jefe decide antes de que nómina las pague.
 *
 * El módulo de KPI ya calcula el tiempo extra real de cada día, pero calculado no es lo
 * mismo que autorizado: alguien puede quedarse dos horas de más por su cuenta. Aquí el
 * jefe dice sí o no, día por día, y la pre-nómina solo suma los APROBADO.
 *
 * Los minutos se guardan tal como estaban al aprobar. Si después alguien corrige la hora
 * de una checada, el número aprobado no se mueve solo: el jefe autorizó una cantidad, no
 * una fórmula. Lo que sí cambia es el calculado, y la diferencia se ve en la pantalla.
 *
 * El alcance es el mismo de la pizarra y los KPI: cada quien decide sobre su gente.
 */
@Injectable()
export class HorasExtraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamBoard: TeamBoardService,
    private readonly kpis: KpisEquipoService,
  ) {}

  /** Nadie aprueba sus propias horas extra, ni las de quien no es de su equipo. */
  private async exigirAlcance(viewer: Viewer, companyId: number | null, userId: number) {
    const { scoped } = await this.teamBoard.resolveScope(viewer, companyId);
    if (!scoped.some((u) => u.id === userId)) {
      throw new NotFoundException('Usuario fuera de tu alcance');
    }
    if (userId === viewer.id) {
      throw new ForbiddenException('Nadie aprueba sus propias horas extra');
    }
  }

  /**
   * Aprueba o rechaza el tiempo extra de una persona en un día.
   *
   * `minutos` es lo que el jefe autoriza: normalmente el calculado, pero puede recortarlo
   * («se quedó dos horas, autorizo una»). Volver a decidir sobre el mismo día pisa la
   * decisión anterior — es una sola respuesta por persona y día, no un historial.
   */
  async decidir(
    viewer: Viewer,
    companyId: number | null,
    body: { userId?: number; fecha?: string; minutos?: number; estado?: string; nota?: string },
  ): Promise<DecisionExtra> {
    const userId = Number(body?.userId);
    if (!Number.isInteger(userId) || userId <= 0) throw new BadRequestException('Falta la persona');

    const fecha = String(body?.fecha ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new BadRequestException('fecha debe ser AAAA-MM-DD');
    }
    const estado = String(body?.estado ?? '').toUpperCase() as EstadoExtra;
    if (!ESTADOS.includes(estado)) {
      throw new BadRequestException('estado debe ser PENDIENTE, APROBADO o RECHAZADO');
    }
    const minutos = Math.round(Number(body?.minutos ?? 0));
    if (!Number.isFinite(minutos) || minutos < 0) {
      throw new BadRequestException('minutos debe ser un número de minutos');
    }
    if (estado === 'APROBADO' && minutos <= 0) {
      throw new BadRequestException('No se aprueban cero minutos: rechaza el día o corrige la hora');
    }
    // Un día entero de extra es una jornada completa de más: casi siempre es un error de
    // checada, no un turno doble. Que alguien lo mire antes de que llegue a nómina.
    if (minutos > 12 * 60) {
      throw new BadRequestException('Más de 12 h extra en un día: revisa las checadas primero');
    }

    await this.exigirAlcance(viewer, companyId, userId);
    const tenantId = await this.resolverEmpresa(companyId, userId);
    const nota = (body?.nota ?? '').trim().slice(0, 500) || null;

    const fila = await this.prisma.overtimeApproval.upsert({
      where: { userId_fecha: { userId, fecha: workDateColumn(parseWorkDate(fecha)) } },
      create: {
        userId,
        fecha: workDateColumn(parseWorkDate(fecha)),
        minutos,
        estado,
        nota,
        aprobadoPorId: estado === 'PENDIENTE' ? null : viewer.id,
        companyId: tenantId,
      },
      update: {
        minutos,
        estado,
        nota,
        aprobadoPorId: estado === 'PENDIENTE' ? null : viewer.id,
      },
      include: { aprobadoPor: { select: { id: true, nombre: true } } },
    });

    return this.aSalida(fila);
  }

  /** Decisiones ya tomadas en un rango, para pintar la pantalla y la pre-nómina. */
  async listar(
    viewer: Viewer,
    companyId: number | null,
    rango: { desde: string; hasta: string },
    userId?: number | null,
  ): Promise<DecisionExtra[]> {
    const { scoped } = await this.teamBoard.resolveScope(viewer, companyId);
    const alcance = scoped.map((u) => u.id);
    if (userId && !alcance.includes(userId)) throw new NotFoundException('Usuario fuera de tu alcance');

    const filas = await this.prisma.overtimeApproval.findMany({
      where: {
        userId: userId ? userId : { in: alcance.length ? alcance : [-1] },
        fecha: {
          gte: workDateColumn(parseWorkDate(rango.desde)),
          lte: workDateColumn(parseWorkDate(rango.hasta)),
        },
        ...(companyId != null ? { companyId } : {}),
      },
      orderBy: [{ fecha: 'desc' }, { userId: 'asc' }],
      include: { aprobadoPor: { select: { id: true, nombre: true } } },
    });
    return filas.map((f) => this.aSalida(f));
  }

  /**
   * La empresa en la que vive la decisión.
   *
   * Con el header puesto es esa. Sin él —una petición vieja, un script— se usa la
   * membresía de la persona sobre la que se decide, no la de quien decide: un jefe de
   * dos empresas no debe apuntar las horas extra de alguien en la equivocada.
   */
  private async resolverEmpresa(companyId: number | null, userId: number): Promise<number> {
    if (companyId != null && Number(companyId) > 0) return Number(companyId);
    const membresia = await this.prisma.userCompany.findFirst({
      where: { userId },
      select: { companyId: true },
      orderBy: { companyId: 'asc' },
    });
    if (!membresia?.companyId) {
      throw new BadRequestException('No se pudo resolver la empresa de la persona');
    }
    return membresia.companyId;
  }

  private aSalida(f: any): DecisionExtra {
    return {
      userId: f.userId,
      fecha: f.fecha.toISOString().slice(0, 10),
      minutos: f.minutos,
      estado: f.estado as EstadoExtra,
      nota: f.nota ?? null,
      aprobadoPor: f.aprobadoPor ? { id: f.aprobadoPor.id, nombre: f.aprobadoPor.nombre } : null,
      at: (f.updatedAt ?? f.at).toISOString(),
    };
  }

  // ───────────────────────────────────────────────────────── horario de cada persona

  /**
   * Escribe (o borra) el horario propio de una persona.
   *
   * Mandar todo vacío borra la fila y la persona vuelve a su plantilla: es la única forma
   * honesta de decir «déjalo como estaba», y evita que quede una fila que repite la
   * plantilla y se desfase el día que alguien cambie los valores por omisión.
   */
  async guardarHorario(
    viewer: Viewer,
    companyId: number | null,
    body: {
      userId?: number;
      horaEntrada?: string | null;
      horaSalida?: string | null;
      dias?: number[] | null;
      graciaMin?: number | null;
      jornadaOrdinariaMin?: number | null;
    },
  ) {
    const userId = Number(body?.userId);
    if (!Number.isInteger(userId) || userId <= 0) throw new BadRequestException('Falta la persona');
    const { scoped } = await this.teamBoard.resolveScope(viewer, companyId);
    if (!scoped.some((u) => u.id === userId)) throw new NotFoundException('Usuario fuera de tu alcance');

    const horaEntrada = body.horaEntrada == null || body.horaEntrada === '' ? null : horaValida(body.horaEntrada);
    if (body.horaEntrada && !horaEntrada) throw new BadRequestException('horaEntrada debe ser HH:MM');
    const horaSalida = body.horaSalida == null || body.horaSalida === '' ? null : horaValida(body.horaSalida);
    if (body.horaSalida && !horaSalida) throw new BadRequestException('horaSalida debe ser HH:MM');

    const dias = [...new Set((body.dias ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    const graciaMin = this.enteroOpcional(body.graciaMin, 0, 180, 'graciaMin');
    const jornadaOrdinariaMin = this.enteroOpcional(body.jornadaOrdinariaMin, 60, 16 * 60, 'jornadaOrdinariaMin');

    const vacio =
      !horaEntrada && !horaSalida && !dias.length && graciaMin == null && jornadaOrdinariaMin == null;
    if (vacio) {
      await this.prisma.workSchedule.deleteMany({ where: { userId } });
      return { userId, horario: null, message: 'Vuelve al horario de su plantilla' };
    }

    const tenantId = await this.resolverEmpresa(companyId, userId);
    const fila = await this.prisma.workSchedule.upsert({
      where: { userId },
      create: {
        userId,
        horaEntrada,
        horaSalida,
        dias,
        graciaMin,
        jornadaOrdinariaMin,
        actualizadoPorId: viewer.id,
        companyId: tenantId,
      },
      update: {
        horaEntrada,
        horaSalida,
        dias,
        graciaMin,
        jornadaOrdinariaMin,
        actualizadoPorId: viewer.id,
      },
      include: { actualizadoPor: { select: { id: true, nombre: true } } },
    });

    return {
      userId,
      message: 'Horario guardado',
      horario: {
        horaEntrada: fila.horaEntrada,
        horaSalida: fila.horaSalida,
        dias: fila.dias,
        graciaMin: fila.graciaMin,
        jornadaOrdinariaMin: fila.jornadaOrdinariaMin,
        actualizadoPor: fila.actualizadoPor
          ? { id: fila.actualizadoPor.id, nombre: fila.actualizadoPor.nombre }
          : null,
        updatedAt: fila.updatedAt.toISOString(),
      },
    };
  }

  /** Horarios propios de la gente que este jefe alcanza. Quien no tiene fila, no sale. */
  async listarHorarios(viewer: Viewer, companyId: number | null) {
    const { scoped } = await this.teamBoard.resolveScope(viewer, companyId);
    const alcance = scoped.map((u) => u.id);
    const filas = await this.prisma.workSchedule.findMany({
      where: {
        userId: { in: alcance.length ? alcance : [-1] },
        ...(companyId != null ? { companyId } : {}),
      },
      include: { actualizadoPor: { select: { id: true, nombre: true } } },
    });
    return filas.map((f) => ({
      userId: f.userId,
      horaEntrada: f.horaEntrada,
      horaSalida: f.horaSalida,
      dias: f.dias,
      graciaMin: f.graciaMin,
      jornadaOrdinariaMin: f.jornadaOrdinariaMin,
      actualizadoPor: f.actualizadoPor ? { id: f.actualizadoPor.id, nombre: f.actualizadoPor.nombre } : null,
      updatedAt: f.updatedAt.toISOString(),
    }));
  }

  private enteroOpcional(valor: unknown, min: number, max: number, campo: string): number | null {
    if (valor == null || valor === '') return null;
    const n = Math.round(Number(valor));
    if (!Number.isFinite(n) || n < min || n > max) {
      throw new BadRequestException(`${campo} debe estar entre ${min} y ${max}`);
    }
    return n;
  }

  /** Rango en `AAAA-MM-DD`, con el mismo tope que los KPI. */
  resolveDias(desde?: string | null, hasta?: string | null) {
    return this.kpis.resolveDias(desde, hasta);
  }
}
