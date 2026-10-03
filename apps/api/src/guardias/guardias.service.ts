import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isNonEmployeeEmail } from '../common/platform-accounts.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { workDateKey } from '../common/time/workday.js';
import { esDeTodaLaEmpresa, puedeAsignarA, type Alcanzador } from '../me/equipo-alcance.js';
import { diaDeLaSemana, esSabadoODomingo, fechaClave, fechaColumna } from './guardias-reglas.js';

export type GuardiaActor = Alcanzador;

export type PersonaGuardia = { id: number; nombre: string; puesto: string | null; avatarUrl: string | null };

export type GuardiaDto = {
  id: number;
  userId: number;
  /** `AAAA-MM-DD` */
  fecha: string;
  nota: string | null;
  persona: PersonaGuardia | null;
  creadoPor: { id: number; nombre: string } | null;
  createdAt: string;
  /** ¿Quien consulta la puede quitar? */
  puedeQuitar: boolean;
};

export const NOTA_GUARDIA_MAX = 300;
/** Ventana máxima de una consulta: un trimestre basta para cualquier calendario. */
const RANGO_MAX_DIAS = 92;
/** Sin rango, las próximas cuatro semanas. */
const RANGO_POR_OMISION_DIAS = 28;

type Padron = Array<{
  id: number;
  email: string;
  managerId: number | null;
  nombre: string;
  puesto: string | null;
  avatarUrl: string | null;
}>;

const SELECT = {
  id: true,
  userId: true,
  fecha: true,
  nota: true,
  createdAt: true,
  user: { select: { id: true, nombre: true, puesto: true, avatarUrl: true } },
  creadoPor: { select: { id: true, nombre: true } },
} as const;

/** «sáb 3 oct» (la columna es DATE: se lee en UTC). */
export function fechaLegible(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  const partes = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
    .formatToParts(d);
  const v = (t: string) => (partes.find((p) => p.type === t)?.value ?? '').replace(/\.$/, '');
  return `${v('weekday')} ${v('day')} ${v('month')}`;
}

function sumarDias(fecha: string, dias: number): string {
  const d = fechaColumna(fecha);
  d.setUTCDate(d.getUTCDate() + dias);
  return fechaClave(d);
}

/**
 * ¿`actor` puede programarle (o quitarle) una guardia a `targetId`? Dirección, a cualquiera
 * —también a sí misma—; los demás, a quien pueden asignarle actividades (`puedeAsignarA`:
 * su organigrama hacia abajo y el flujo de despacho, nunca a sí mismos).
 */
export function puedeProgramarA(actor: GuardiaActor, users: Padron, targetId: number): boolean {
  if (esDeTodaLaEmpresa(actor)) return users.some((u) => u.id === Number(targetId));
  return puedeAsignarA(actor, users, targetId);
}

/**
 * Guardias de fin de semana: quién trabaja cada sábado y domingo.
 *
 * La regla de checada vive en asistencia (`diaDeGuardia`); aquí solo se calendariza.
 */
@Injectable()
export class GuardiasService {
  private readonly logger = new Logger(GuardiasService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /** Personas activas de la empresa (sin cuentas de plataforma), con correo y jefe. */
  private async padron(tenantId: number): Promise<Padron> {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, companyMemberships: { some: { companyId: tenantId } } },
      select: { id: true, email: true, managerId: true, nombre: true, puesto: true, avatarUrl: true },
      orderBy: { nombre: 'asc' },
    });
    return users.filter((u) => !isNonEmployeeEmail(u.email));
  }

  /**
   * Guardias del rango (`desde`/`hasta` en `AAAA-MM-DD`; sin rango, las próximas cuatro
   * semanas). Dirección ve todas; un encargado, las de su gente y las suyas; los demás,
   * solo las suyas. También devuelve a quién puede programar quien consulta.
   */
  async listar(actor: GuardiaActor, query: { desde?: string; hasta?: string }, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const hoy = workDateKey(new Date());
    const desde = query?.desde?.trim() || hoy;
    const hasta = query?.hasta?.trim() || sumarDias(desde, RANGO_POR_OMISION_DIAS);
    if (diaDeLaSemana(desde) == null || diaDeLaSemana(hasta) == null) {
      throw new BadRequestException('Rango inválido: usa fechas AAAA-MM-DD');
    }
    if (hasta < desde) throw new BadRequestException('El rango termina antes de empezar');
    if (hasta > sumarDias(desde, RANGO_MAX_DIAS)) {
      throw new BadRequestException(`Consulta como máximo ${RANGO_MAX_DIAS} días`);
    }

    const users = await this.padron(tenantId);
    const todas = esDeTodaLaEmpresa(actor);
    const programables = users.filter((u) => puedeProgramarA(actor, users, u.id));
    const visibles = todas ? null : [actor.id, ...programables.map((u) => u.id)];

    const filas = await this.prisma.guardia.findMany({
      where: {
        ...companyWhere(tenantId),
        fecha: { gte: fechaColumna(desde), lte: fechaColumna(hasta) },
        ...(visibles ? { userId: { in: visibles } } : {}),
      },
      select: SELECT,
      orderBy: [{ fecha: 'asc' }, { userId: 'asc' }],
    });

    const programableIds = new Set(programables.map((u) => u.id));
    return {
      desde,
      hasta,
      hoy,
      puedeProgramar: programables.length > 0,
      personas: programables.map((u) => this.persona(u)),
      items: filas.map((f) => this.dto(f, programableIds.has(f.userId) && fechaClave(f.fecha) >= hoy)),
    };
  }

  /**
   * ¿Quiénes de estas personas tienen guardia ese día? Lo usa el formulario de asignar
   * actividad para avisar (sin bloquear) cuando la fecha cae en fin de semana.
   */
  async cobertura(actor: GuardiaActor, query: { fecha?: string; userIds?: string }, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const fecha = String(query?.fecha ?? '').trim();
    if (diaDeLaSemana(fecha) == null) throw new BadRequestException('Fecha inválida: usa AAAA-MM-DD');
    const finDeSemana = esSabadoODomingo(fecha);
    const pedidos = String(query?.userIds ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, 50);
    if (!finDeSemana || !pedidos.length) return { fecha, finDeSemana, conGuardia: [] as number[] };

    const filas = await this.prisma.guardia.findMany({
      where: { ...companyWhere(tenantId), fecha: fechaColumna(fecha), userId: { in: pedidos } },
      select: { userId: true },
    });
    return { fecha, finDeSemana, conGuardia: filas.map((f) => f.userId) };
  }

  async programar(
    actor: GuardiaActor,
    body: { userId?: unknown; fecha?: unknown; nota?: unknown },
    companyId?: number | null,
  ): Promise<GuardiaDto> {
    const tenantId = requireCompanyId(companyId);
    const userId = Number(body?.userId);
    if (!Number.isInteger(userId) || userId <= 0) throw new BadRequestException('Elige a la persona');
    const fecha = typeof body?.fecha === 'string' ? body.fecha.trim() : '';
    if (diaDeLaSemana(fecha) == null) throw new BadRequestException('Elige un día válido (AAAA-MM-DD)');
    if (!esSabadoODomingo(fecha)) {
      throw new BadRequestException('Las guardias son solo en sábado o domingo');
    }
    if (fecha < workDateKey(new Date())) {
      throw new BadRequestException('Ese día ya pasó: las guardias se programan de hoy en adelante');
    }
    const nota =
      typeof body?.nota === 'string' && body.nota.trim()
        ? body.nota.trim().replace(/\s+/g, ' ').slice(0, NOTA_GUARDIA_MAX)
        : null;

    const persona = await this.prisma.user.findFirst({
      where: { id: userId, companyMemberships: { some: { companyId: tenantId } } },
      select: { id: true, email: true, isActive: true },
    });
    if (!persona || isNonEmployeeEmail(persona.email)) throw new NotFoundException('Esa persona no está en el equipo');
    if (!persona.isActive) {
      throw new BadRequestException('Esa persona está dada de baja: no se le pueden programar guardias');
    }
    const users = await this.padron(tenantId);
    if (!puedeProgramarA(actor, users, userId)) {
      throw new ForbiddenException('Solo puedes programar guardias a la gente de tu equipo');
    }

    let fila;
    try {
      fila = await this.prisma.guardia.create({
        data: { companyId: tenantId, userId, fecha: fechaColumna(fecha), nota, creadoPorId: actor.id },
        select: SELECT,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Esa persona ya tiene guardia ese día');
      }
      throw error;
    }

    void this.avisar(userId, actor.id, tenantId, fila.id, {
      title: `Tienes guardia el ${fechaLegible(fecha)}`,
      message: nota
        ? `Nota: ${nota}`
        : 'Ese día puedes checar; tu entrada se registra al iniciar tu primer servicio o tarea.',
    });
    return this.dto(fila, true);
  }

  async quitar(actor: GuardiaActor, id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const fila = await this.prisma.guardia.findFirst({
      where: { id, ...companyWhere(tenantId) },
      select: { id: true, userId: true, fecha: true },
    });
    if (!fila) throw new NotFoundException('Guardia no encontrada');
    const users = await this.padron(tenantId);
    if (!puedeProgramarA(actor, users, fila.userId)) {
      throw new ForbiddenException('Solo puedes quitar guardias de la gente de tu equipo');
    }
    const fecha = fechaClave(fila.fecha);
    if (fecha < workDateKey(new Date())) {
      throw new BadRequestException('Esa guardia ya pasó: queda en el historial');
    }
    await this.prisma.guardia.deleteMany({ where: { id: fila.id, ...companyWhere(tenantId) } });
    void this.avisar(fila.userId, actor.id, tenantId, fila.id, {
      title: `Se quitó tu guardia del ${fechaLegible(fecha)}`,
      message: 'Ese día no te toca trabajar.',
    });
    return { removed: true, id: fila.id };
  }

  private persona(u: { id: number; nombre: string; puesto: string | null; avatarUrl: string | null }): PersonaGuardia {
    return { id: u.id, nombre: u.nombre, puesto: u.puesto ?? null, avatarUrl: u.avatarUrl ?? null };
  }

  private dto(
    f: {
      id: number;
      userId: number;
      fecha: Date;
      nota: string | null;
      createdAt: Date;
      user?: { id: number; nombre: string; puesto: string | null; avatarUrl: string | null } | null;
      creadoPor?: { id: number; nombre: string } | null;
    },
    puedeQuitar: boolean,
  ): GuardiaDto {
    return {
      id: f.id,
      userId: f.userId,
      fecha: fechaClave(f.fecha),
      nota: f.nota ?? null,
      persona: f.user ? this.persona(f.user) : null,
      creadoPor: f.creadoPor ? { id: f.creadoPor.id, nombre: f.creadoPor.nombre } : null,
      createdAt: f.createdAt.toISOString(),
      puedeQuitar,
    };
  }

  /** Aviso a la persona; un fallo del aviso nunca rompe la guardia. Nadie se avisa a sí mismo. */
  private async avisar(
    userId: number,
    actorId: number,
    companyId: number,
    guardiaId: number,
    texto: { title: string; message: string },
  ) {
    if (!this.notifications || userId === actorId) return;
    try {
      await this.notifications.createNotification({
        userId,
        type: 'ATTENDANCE_UPDATE',
        category: 'attendance',
        ...texto,
        triggerUserId: actorId,
        relatedEntityId: guardiaId,
        entityType: 'Guardia',
        relatedUrl: '/erp/asistencias',
        priority: 'normal',
        companyId,
        dedupeSeconds: 0,
      });
    } catch (error) {
      this.logger.warn(`avisar guardia ${guardiaId}: ${String(error)}`);
    }
  }
}
