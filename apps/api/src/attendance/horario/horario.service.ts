import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ChatService } from '../../chat/chat.service.js';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { parseWorkDate, workDateColumn, workDateKey } from '../../common/time/workday.js';
import {
  avisosProgramacion,
  horaValida,
  PLANTILLAS_TURNO_OMISION,
  resolverHorario,
  sumaDias,
  type HorarioCitado,
  type TurnoProgramado,
} from './horario-de.js';
import {
  esRhODireccion,
  puedeProgramarHorario,
  puedeVerHorario,
  type ActorHorario,
  type PersonaArbol,
} from './permisos-horario.js';
import { resumenJornada } from './resumen-jornada.js';
import { productividadDia } from './productividad.js';
import {
  normalizarParametros,
  parametrosVigentesEn,
  PARAMETROS_DEFAULT,
  type ParametrosProductividad,
  NOTA_LFT_INFORMATIVA,
} from './parametros-productividad.js';

export type Actor = ActorHorario & { nombre?: string | null };

type AjusteHorario = {
  at: string;
  porId: number;
  porNombre?: string | null;
  de: { horaEntrada: string; horaSalida: string };
  a: { horaEntrada: string; horaSalida: string };
  tipo: 'programar' | 'extender' | 'recortar';
  motivo?: string | null;
};

/** Prisma client ampliado con los modelos nuevos (hasta `prisma generate`). */
type PrismaX = PrismaService & {
  horarioDia: any;
  plantillaTurno: any;
  productividadParametro: any;
};

@Injectable()
export class HorarioService {
  private readonly log = new Logger(HorarioService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly chat?: ChatService,
  ) {}

  private get db(): PrismaX {
    return this.prisma as PrismaX;
  }

  /**
   * Misma resolución que `horarioDe`, pero si la tabla aún no existe o la consulta
   * falla, no truene: WorkSchedule → 10:00–18:00 (comportamiento actual).
   */
  async horarioDeTolerante(userId: number, fecha: string, companyId: number): Promise<HorarioCitado> {
    try {
      return await this.horarioDe(userId, fecha, companyId);
    } catch (err) {
      this.log.warn(`horarioDe tolerante user=${userId} fecha=${fecha}: ${(err as Error).message}`);
      const user = await this.prisma.user
        .findUnique({ where: { id: userId }, select: { horario: true } })
        .catch(() => null);
      return resolverHorario({
        fecha: fecha.slice(0, 10),
        workSchedule: user?.horario ?? null,
      });
    }
  }

  /** Única fuente: HorarioDia → plantilla → WorkSchedule → 10:00–18:00. */
  async horarioDe(userId: number, fecha: string, companyId: number): Promise<HorarioCitado> {
    const dia = workDateColumn(parseWorkDate(fecha));
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, horario: true },
    });
    if (!user) throw new BadRequestException('Persona no encontrada');

    let fila: {
      horaEntrada: string;
      horaSalida: string;
      graciaMin: number | null;
      motivo: string | null;
      plantillaTurnoId: number | null;
      plantillaTurno: {
        id: number;
        horaEntrada: string;
        horaSalida: string;
        tipo: string;
        graciaMin: number | null;
      } | null;
    } | null = null;
    try {
      fila = await this.db.horarioDia.findUnique({
        where: { userId_fecha: { userId, fecha: dia } },
        include: { plantillaTurno: true },
      });
    } catch (err) {
      // Migración aún no aplicada o cliente Prisma sin el modelo: sigue con WorkSchedule.
      this.log.warn(`HorarioDia no disponible (${fecha}): ${(err as Error).message}`);
      void companyId;
    }

    return resolverHorario({
      fecha: fecha.slice(0, 10),
      dia: fila
        ? {
            horaEntrada: fila.horaEntrada,
            horaSalida: fila.horaSalida,
            graciaMin: fila.graciaMin,
            motivo: fila.motivo,
            plantillaTurnoId: fila.plantillaTurnoId,
          }
        : null,
      plantillaTurno: fila?.plantillaTurno
        ? {
            id: fila.plantillaTurno.id,
            horaEntrada: fila.plantillaTurno.horaEntrada,
            horaSalida: fila.plantillaTurno.horaSalida,
            tipo: fila.plantillaTurno.tipo as 'diurno' | 'nocturno' | 'mixto',
            graciaMin: fila.plantillaTurno.graciaMin,
          }
        : null,
      workSchedule: user.horario,
    });
  }

  /** `horarioDe` con alcance: la propia persona, su jerarquía hacia abajo, RH y dirección; solo de la empresa. */
  async horarioVisible(actor: Actor, userId: number, fecha: string, companyId: number | null): Promise<HorarioCitado> {
    const tenantId = requireCompanyId(companyId);
    const personas = await this.cargarPersonas(tenantId);
    if (!personas.some((p) => p.id === userId) || !puedeVerHorario(actor, userId, personas)) {
      throw new ForbiddenException('No puedes ver el horario de esa persona');
    }
    return this.horarioDe(userId, fecha, tenantId);
  }

  async listar(
    actor: Actor,
    q: { userIds?: number[]; from: string; to: string },
    companyId: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const personas = await this.cargarPersonas(tenantId);
    const ids = (q.userIds?.length ? q.userIds : personas.map((p) => p.id)).filter((id) =>
      puedeVerHorario(actor, id, personas),
    );
    const from = workDateColumn(parseWorkDate(q.from));
    const to = workDateColumn(parseWorkDate(q.to));
    const filas = await this.db.horarioDia.findMany({
      where: { companyId: tenantId, userId: { in: ids }, fecha: { gte: from, lte: to } },
      include: { plantillaTurno: true, creadoPor: { select: { id: true, nombre: true } } },
      orderBy: [{ userId: 'asc' }, { fecha: 'asc' }],
    });
    const schedules = await this.prisma.workSchedule.findMany({
      where: { companyId: tenantId, userId: { in: ids } },
    });
    const byWs = new Map(schedules.map((s) => [s.userId, s]));
    const byDia = new Map<string, (typeof filas)[number]>();
    for (const f of filas) byDia.set(`${f.userId}:${f.fecha.toISOString().slice(0, 10)}`, f);

    const items: Array<{ userId: number; fecha: string; horario: HorarioCitado; fila: unknown }> = [];
    for (const userId of ids) {
      for (let d = q.from; d <= q.to; d = sumaDias(d, 1)) {
        const fila = byDia.get(`${userId}:${d}`) ?? null;
        items.push({
          userId,
          fecha: d,
          horario: resolverHorario({
            fecha: d,
            dia: fila,
            workSchedule: byWs.get(userId) ?? null,
            plantillaTurno: fila?.plantillaTurno
              ? {
                  id: fila.plantillaTurno.id,
                  horaEntrada: fila.plantillaTurno.horaEntrada,
                  horaSalida: fila.plantillaTurno.horaSalida,
                  tipo: fila.plantillaTurno.tipo,
                  graciaMin: fila.plantillaTurno.graciaMin,
                }
              : null,
          }),
          fila: fila
            ? {
                id: fila.id,
                motivo: fila.motivo,
                ajustes: fila.ajustes,
                avisos: fila.avisos,
                creadoPor: fila.creadoPor,
                plantillaTurnoId: fila.plantillaTurnoId,
              }
            : null,
        });
      }
    }
    return { items, from: q.from, to: q.to };
  }

  async programar(
    actor: Actor,
    body: {
      userIds?: number[];
      fechas?: string[];
      horaEntrada?: string;
      horaSalida?: string;
      plantillaTurnoId?: number | null;
      motivo?: string | null;
      forzarSolapes?: boolean;
    },
    companyId: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const personas = await this.cargarPersonas(tenantId);
    const userIds = [...new Set((body.userIds ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
    const fechas = [...new Set((body.fechas ?? []).map((f) => String(f).slice(0, 10)))];
    if (!userIds.length) throw new BadRequestException('Indica al menos una persona');
    if (!fechas.length) throw new BadRequestException('Indica al menos un día');

    let horaEntrada = horaValida(body.horaEntrada);
    let horaSalida = horaValida(body.horaSalida);
    let plantilla: { id: number; horaEntrada: string; horaSalida: string } | null = null;
    if (body.plantillaTurnoId != null) {
      plantilla = await this.db.plantillaTurno.findFirst({
        where: { id: Number(body.plantillaTurnoId), companyId: tenantId, activa: true },
      });
      if (!plantilla) throw new BadRequestException('Plantilla de turno no encontrada');
      horaEntrada = horaEntrada ?? plantilla.horaEntrada;
      horaSalida = horaSalida ?? plantilla.horaSalida;
    }
    if (!horaEntrada || !horaSalida) {
      throw new BadRequestException('horaEntrada y horaSalida (HH:MM) o plantillaTurnoId son obligatorios');
    }

    for (const id of userIds) {
      if (!personas.some((p) => p.id === id)) throw new ForbiddenException('No puedes programar el horario de esa persona');
      const dec = puedeProgramarHorario(actor, id, personas);
      if (!dec.ok) {
        throw new ForbiddenException(
          dec.motivo === 'si_mismo'
            ? 'Nadie puede cambiarse el horario a sí mismo'
            : 'No puedes programar el horario de esa persona',
        );
      }
    }

    const turnos: TurnoProgramado[] = [];
    for (const userId of userIds) {
      for (const fecha of fechas) turnos.push({ userId, fecha, horaEntrada, horaSalida });
    }
    const avisos = avisosProgramacion({ turnos });
    if (avisos.solapes.length && !body.forzarSolapes) {
      return { ok: false, requiereConfirmacion: true, avisos, creados: 0 };
    }

    let creados = 0;
    for (const t of turnos) {
      await this.upsertDia({
        actor,
        companyId: tenantId,
        userId: t.userId,
        fecha: t.fecha,
        horaEntrada: t.horaEntrada,
        horaSalida: t.horaSalida,
        plantillaTurnoId: plantilla?.id ?? null,
        motivo: body.motivo ?? null,
        tipo: 'programar',
        avisos,
      });
      creados += 1;
      await this.avisarPersona(actor, t.userId, t.fecha, t.horaEntrada, t.horaSalida, tenantId);
    }
    return { ok: true, creados, avisos };
  }

  async extenderORecortar(
    actor: Actor,
    body: {
      userId?: number;
      fecha?: string;
      hasta?: string;
      tipo: 'extender' | 'recortar';
      motivo?: string | null;
    },
    companyId: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const personas = await this.cargarPersonas(tenantId);
    const userId = Number(body.userId);
    const fecha = String(body.fecha ?? '').slice(0, 10);
    const hasta = horaValida(body.hasta);
    if (!Number.isFinite(userId) || userId <= 0) throw new BadRequestException('userId inválido');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new BadRequestException('fecha AAAA-MM-DD');
    if (!hasta) throw new BadRequestException('Indica la hora (HH:MM)');

    if (!personas.some((p) => p.id === userId)) throw new ForbiddenException('No puedes ajustar el horario de esa persona');
    const dec = puedeProgramarHorario(actor, userId, personas);
    if (!dec.ok) {
      throw new ForbiddenException(
        dec.motivo === 'si_mismo'
          ? 'Nadie puede cambiarse el horario a sí mismo'
          : 'No puedes ajustar el horario de esa persona',
      );
    }

    const actual = await this.horarioDe(userId, fecha, tenantId);
    const diaCol = workDateColumn(parseWorkDate(fecha));
    const attDay = await this.prisma.attendanceDay.findUnique({
      where: { companyId_userId_date: { companyId: tenantId, userId, date: diaCol } },
    });
    // Si ya checó entrada, no se mueve la hora de entrada (solo la salida citada).
    if (attDay?.lastEntryAt && body.tipo === 'recortar') {
      // recortar/extender solo tocan salida
    }

    const horaEntrada = actual.horaEntrada;
    const horaSalida = hasta;

    await this.upsertDia({
      actor,
      companyId: tenantId,
      userId,
      fecha,
      horaEntrada,
      horaSalida,
      plantillaTurnoId: actual.plantillaTurnoId,
      motivo:
        body.motivo ??
        (body.tipo === 'extender' ? `Extender hasta ${hasta}` : `Terminar antes a las ${hasta}`),
      tipo: body.tipo,
      avisos: avisosProgramacion({ turnos: [{ userId, fecha, horaEntrada, horaSalida }] }),
      previa: { horaEntrada: actual.horaEntrada, horaSalida: actual.horaSalida },
    });

    await this.avisarPersona(actor, userId, fecha, horaEntrada, horaSalida, tenantId);
    return { ok: true, horario: await this.horarioDe(userId, fecha, tenantId) };
  }

  async plantillas(companyId: number | null) {
    const tenantId = requireCompanyId(companyId);
    await this.asegurarPlantillas(tenantId);
    const rows = await this.db.plantillaTurno.findMany({
      where: { companyId: tenantId, activa: true },
      orderBy: { id: 'asc' },
    });
    return { items: rows, omision: PLANTILLAS_TURNO_OMISION };
  }

  async parametros(companyId: number | null, fecha?: string) {
    const tenantId = requireCompanyId(companyId);
    const rows = await this.db.productividadParametro.findMany({
      where: { companyId: tenantId },
      orderBy: { vigenteDesde: 'desc' },
    });
    const historial: ParametrosProductividad[] = rows.map((r: {
      vigenteDesde: Date;
      rangoNormalInicio: string;
      rangoNormalFin: string;
      graciaMin: number;
      pesoPuntualidad: number;
      pesoAprovechamiento: number;
      pesoEficiencia: number;
      topeBonoPct: number;
      factorExtra: number;
      topeExtraSemanaMin: number;
      franjaNocturnaInicio: string;
      franjaNocturnaFin: string;
      nota: string | null;
    }) =>
      normalizarParametros({
        vigenteDesde: r.vigenteDesde.toISOString().slice(0, 10),
        rangoNormalInicio: r.rangoNormalInicio,
        rangoNormalFin: r.rangoNormalFin,
        graciaMin: r.graciaMin,
        pesoPuntualidad: r.pesoPuntualidad,
        pesoAprovechamiento: r.pesoAprovechamiento,
        pesoEficiencia: r.pesoEficiencia,
        topeBonoPct: r.topeBonoPct,
        factorExtra: r.factorExtra,
        topeExtraSemanaMin: r.topeExtraSemanaMin,
        franjaNocturnaInicio: r.franjaNocturnaInicio,
        franjaNocturnaFin: r.franjaNocturnaFin,
        nota: r.nota,
      }),
    );
    const dia = (fecha ?? workDateKey(new Date())).slice(0, 10);
    return {
      vigente: parametrosVigentesEn(historial, dia),
      historial,
      notaLft: NOTA_LFT_INFORMATIVA,
      default: PARAMETROS_DEFAULT,
    };
  }

  async guardarParametros(
    actor: Actor,
    body: Partial<ParametrosProductividad> & { vigenteDesde: string },
    companyId: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    if (!esRhODireccion(actor)) {
      throw new ForbiddenException('Solo dirección o RH pueden cambiar parámetros');
    }
    const norm = normalizarParametros({ ...body, vigenteDesde: String(body.vigenteDesde).slice(0, 10) });
    const vigenteDesde = workDateColumn(parseWorkDate(norm.vigenteDesde));
    const row = await this.db.productividadParametro.upsert({
      where: { companyId_vigenteDesde: { companyId: tenantId, vigenteDesde } },
      create: {
        companyId: tenantId,
        vigenteDesde,
        rangoNormalInicio: norm.rangoNormalInicio,
        rangoNormalFin: norm.rangoNormalFin,
        graciaMin: norm.graciaMin,
        pesoPuntualidad: norm.pesoPuntualidad,
        pesoAprovechamiento: norm.pesoAprovechamiento,
        pesoEficiencia: norm.pesoEficiencia,
        topeBonoPct: norm.topeBonoPct,
        factorExtra: norm.factorExtra,
        topeExtraSemanaMin: norm.topeExtraSemanaMin,
        franjaNocturnaInicio: norm.franjaNocturnaInicio,
        franjaNocturnaFin: norm.franjaNocturnaFin,
        creadoPorId: actor.id,
        nota: norm.nota,
      },
      update: {
        rangoNormalInicio: norm.rangoNormalInicio,
        rangoNormalFin: norm.rangoNormalFin,
        graciaMin: norm.graciaMin,
        pesoPuntualidad: norm.pesoPuntualidad,
        pesoAprovechamiento: norm.pesoAprovechamiento,
        pesoEficiencia: norm.pesoEficiencia,
        topeBonoPct: norm.topeBonoPct,
        factorExtra: norm.factorExtra,
        topeExtraSemanaMin: norm.topeExtraSemanaMin,
        franjaNocturnaInicio: norm.franjaNocturnaInicio,
        franjaNocturnaFin: norm.franjaNocturnaFin,
        nota: norm.nota,
      },
    });
    return { ok: true, parametros: norm, id: row.id };
  }

  async resumenYProductividad(
    actor: Actor,
    q: {
      userId: number;
      fecha: string;
      entradaReal?: string | null;
      salidaReal?: string | null;
      minutosProductivos?: number;
      actividades?: Array<{ realMin: number; estimadoMin: number; titulo?: string }>;
      esFestivo?: boolean;
      esDiaDescanso?: boolean;
    },
    companyId: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const personas = await this.cargarPersonas(tenantId);
    if (!puedeVerHorario(actor, q.userId, personas)) {
      throw new ForbiddenException('No puedes ver el horario de esa persona');
    }
    const horario = await this.horarioDe(q.userId, q.fecha, tenantId);
    const params = (await this.parametros(tenantId, q.fecha)).vigente;
    const resumen = resumenJornada({
      horario: {
        fecha: q.fecha,
        horaEntrada: horario.horaEntrada,
        horaSalida: horario.horaSalida,
        graciaMin: params.graciaMin || horario.graciaMin,
      },
      entradaReal: q.entradaReal ? new Date(q.entradaReal) : null,
      salidaReal: q.salidaReal ? new Date(q.salidaReal) : null,
      rangoNormal: { inicio: params.rangoNormalInicio, fin: params.rangoNormalFin },
      franjaNocturna: { inicio: params.franjaNocturnaInicio, fin: params.franjaNocturnaFin },
      esFestivo: q.esFestivo,
      esDiaDescanso: q.esDiaDescanso,
    });
    const prod = productividadDia({
      minutosLaborados: resumen.minutosLaborados,
      minutosProductivos: Math.min(
        q.minutosProductivos ?? resumen.minutosLaborados,
        resumen.minutosLaborados,
      ),
      retardoMin: resumen.retardoMin,
      jornadaCitadaMin: horario.jornadaCitadaMin,
      actividades: q.actividades,
      pesos: {
        puntualidad: params.pesoPuntualidad,
        aprovechamiento: params.pesoAprovechamiento,
        eficiencia: params.pesoEficiencia,
      },
    });
    return { horario, resumen, productividad: prod, parametros: params };
  }

  private async upsertDia(p: {
    actor: Actor;
    companyId: number;
    userId: number;
    fecha: string;
    horaEntrada: string;
    horaSalida: string;
    plantillaTurnoId: number | null;
    motivo: string | null;
    tipo: AjusteHorario['tipo'];
    avisos: unknown;
    previa?: { horaEntrada: string; horaSalida: string };
  }) {
    const fecha = workDateColumn(parseWorkDate(p.fecha));
    const existing = await this.db.horarioDia.findUnique({
      where: { userId_fecha: { userId: p.userId, fecha } },
    });
    const ajuste: AjusteHorario = {
      at: new Date().toISOString(),
      porId: p.actor.id,
      porNombre: p.actor.nombre ?? null,
      de: p.previa ?? {
        horaEntrada: existing?.horaEntrada ?? p.horaEntrada,
        horaSalida: existing?.horaSalida ?? p.horaSalida,
      },
      a: { horaEntrada: p.horaEntrada, horaSalida: p.horaSalida },
      tipo: p.tipo,
      motivo: p.motivo,
    };
    const ajustes = [...(Array.isArray(existing?.ajustes) ? existing.ajustes : []), ajuste];
    await this.db.horarioDia.upsert({
      where: { userId_fecha: { userId: p.userId, fecha } },
      create: {
        companyId: p.companyId,
        userId: p.userId,
        fecha,
        horaEntrada: p.horaEntrada,
        horaSalida: p.horaSalida,
        motivo: p.motivo,
        plantillaTurnoId: p.plantillaTurnoId,
        creadoPorId: p.actor.id,
        ajustes,
        avisos: p.avisos,
      },
      update: {
        horaEntrada: p.horaEntrada,
        horaSalida: p.horaSalida,
        motivo: p.motivo,
        plantillaTurnoId: p.plantillaTurnoId,
        ajustes,
        avisos: p.avisos,
      },
    });
  }

  private async avisarPersona(
    actor: Actor,
    userId: number,
    fecha: string,
    horaEntrada: string,
    horaSalida: string,
    companyId: number,
  ) {
    if (!this.chat) return;
    const quien = (actor.nombre || 'Tu supervisor').trim();
    const etiqueta = fecha === workDateKey(new Date()) ? 'Hoy' : fecha === sumaDias(workDateKey(new Date()), 1) ? 'Mañana' : fecha;
    const texto = `${etiqueta} entras a las ${horaEntrada} y sales a las ${horaSalida} · lo puso ${quien}`;
    try {
      await this.chat.avisoDirecto(actor.id, userId, texto, companyId);
    } catch (e) {
      this.log.warn(`No se pudo avisar horario a ${userId}: ${(e as Error).message}`);
    }
  }

  private async asegurarPlantillas(companyId: number) {
    for (const p of PLANTILLAS_TURNO_OMISION) {
      await this.db.plantillaTurno.upsert({
        where: { companyId_clave: { companyId, clave: p.clave } },
        create: {
          companyId,
          clave: p.clave,
          nombre: p.nombre,
          horaEntrada: p.horaEntrada,
          horaSalida: p.horaSalida,
          tipo: p.tipo,
          color: p.color,
        },
        update: {},
      });
    }
  }

  private async cargarPersonas(companyId: number): Promise<PersonaArbol[]> {
    return this.prisma.user.findMany({
      where: { isActive: true, companyMemberships: { some: { companyId } } },
      select: { id: true, managerId: true, email: true, roleKey: true },
    });
  }
}
