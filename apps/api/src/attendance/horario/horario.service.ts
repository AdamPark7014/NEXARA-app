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
import { sinChecador } from '../../common/platform-accounts.js';
import {
  avisosProgramacion,
  extraPrevista,
  horaValida,
  minutosEntreHm,
  PLANTILLAS_TURNO_OMISION,
  resolverHorario,
  sumaDias,
  type AvisosProgramacion,
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

  /**
   * La semana (o el rango, hasta 31 días) del equipo que esta persona puede ver: horario citado de cada
   * día, si descansa, la extra prevista y, hoy, a qué hora entró.
   */
  async listar(actor: Actor, q: { userIds?: number[]; from: string; to: string }, companyId: number | null) {
    const tenantId = requireCompanyId(companyId);
    const fechas = this.rango(q.from, q.to);
    const todas = await this.cargarPersonas(tenantId);
    const pedidos = q.userIds?.length ? new Set(q.userIds) : null;
    const personas = todas
      .filter((p) => (!pedidos || pedidos.has(p.id)) && puedeVerHorario(actor, p.id, todas) && !sinChecador(p))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const ids = personas.map((p) => p.id);
    const { porDia, porPersona } = await this.horariosDe(tenantId, ids, fechas[0], fechas[fechas.length - 1]);
    const hoy = workDateKey(new Date());
    const jornadas = fechas.includes(hoy)
      ? await this.prisma.attendanceDay.findMany({
          where: { companyId: tenantId, userId: { in: ids }, date: workDateColumn(parseWorkDate(hoy)) },
          select: { userId: true, lastEntryAt: true, isOpen: true },
        })
      : [];
    const jornada = new Map(jornadas.map((x) => [x.userId, x]));
    const params = (await this.parametros(tenantId, fechas[0])).vigente;
    const rangoNormal = { inicio: params.rangoNormalInicio, fin: params.rangoNormalFin };

    return {
      from: fechas[0],
      to: fechas[fechas.length - 1],
      hoy,
      topeExtraSemanaMin: params.topeExtraSemanaMin,
      personas: personas.map((p) => {
        const dias = fechas.map((fecha) => {
          const d = this.diaDe(fecha, porDia.get(`${p.id}:${fecha}`) ?? null, porPersona.get(p.id) ?? null);
          return {
            ...d,
            extraMin: d.trabaja ? extraPrevista(d.horario.horaEntrada, d.horario.horaSalida, d.esDescansoHabitual, rangoNormal) : 0,
          };
        });
        const j = jornada.get(p.id);
        return {
          id: p.id,
          nombre: p.nombre,
          puesto: p.puesto ?? null,
          avatarUrl: p.avatarUrl ?? null,
          puedeProgramar: puedeProgramarHorario(actor, p.id, todas).ok,
          entradaHoyAt: j?.lastEntryAt ? j.lastEntryAt.toISOString() : null,
          jornadaAbierta: Boolean(j?.isOpen),
          extraMin: dias.reduce((a, d) => a + d.extraMin, 0),
          dias,
        };
      }),
    };
  }

  /** Lo propio, para «Mi horario»: hoy y los días que siguen. */
  async mio(actor: Actor, q: { from: string; to: string }, companyId: number | null) {
    const tenantId = requireCompanyId(companyId);
    const fechas = this.rango(q.from, q.to);
    const { porDia, porPersona } = await this.horariosDe(tenantId, [actor.id], fechas[0], fechas[fechas.length - 1]);
    const params = (await this.parametros(tenantId, fechas[0])).vigente;
    const rangoNormal = { inicio: params.rangoNormalInicio, fin: params.rangoNormalFin };
    const dias = fechas.map((fecha) => {
      const fila = porDia.get(`${actor.id}:${fecha}`) ?? null;
      const d = this.diaDe(fecha, fila, porPersona.get(actor.id) ?? null);
      const ultimo = Array.isArray(fila?.ajustes) ? (fila.ajustes[fila.ajustes.length - 1] as AjusteHorario | undefined) : undefined;
      return {
        ...d,
        extraMin: d.trabaja ? extraPrevista(d.horario.horaEntrada, d.horario.horaSalida, d.esDescansoHabitual, rangoNormal) : 0,
        loPuso: ultimo?.porNombre ?? null,
        ajuste: ultimo?.tipo ?? null,
      };
    });
    const hoy = workDateKey(new Date());
    const j = await this.prisma.attendanceDay.findFirst({
      where: { companyId: tenantId, userId: actor.id, date: workDateColumn(parseWorkDate(hoy)) },
      select: { lastEntryAt: true, isOpen: true },
    });
    return { hoy, entradaHoyAt: j?.lastEntryAt ? j.lastEntryAt.toISOString() : null, jornadaAbierta: Boolean(j?.isOpen), dias };
  }

  private rango(from: string, to: string): string[] {
    if (!esFecha(from) || !esFecha(to) || to < from) throw new BadRequestException('Rango de fechas no válido (AAAA-MM-DD)');
    const out: string[] = [];
    for (let d = from; d <= to; d = sumaDias(d, 1)) {
      out.push(d);
      if (out.length > 31) throw new BadRequestException('El rango no puede pasar de 31 días');
    }
    return out;
  }

  private async horariosDe(companyId: number, ids: number[], from: string, to: string) {
    const [filas, schedules] = await Promise.all([
      this.db.horarioDia.findMany({
        where: {
          companyId,
          userId: { in: ids },
          fecha: { gte: workDateColumn(parseWorkDate(from)), lte: workDateColumn(parseWorkDate(to)) },
        },
      }),
      this.prisma.workSchedule.findMany({ where: { companyId, userId: { in: ids } } }),
    ]);
    const porDia = new Map<string, any>();
    for (const f of filas) porDia.set(`${f.userId}:${f.fecha.toISOString().slice(0, 10)}`, f);
    const porPersona = new Map<number, any>(schedules.map((x: any) => [x.userId, x]));
    return { porDia, porPersona };
  }

  /** Día citado: programado, el de siempre, o descanso (fin de semana o los días de su horario). */
  private diaDe(fecha: string, fila: any, ws: any) {
    const horario = resolverHorario({ fecha, dia: fila, workSchedule: ws });
    const dow = new Date(`${fecha}T00:00:00Z`).getUTCDay();
    const habituales: number[] = Array.isArray(ws?.dias) && ws.dias.length ? ws.dias : [1, 2, 3, 4, 5];
    const esDescansoHabitual = !habituales.includes(dow);
    return { fecha, horario, programado: Boolean(fila), esDescansoHabitual, trabaja: Boolean(fila) || !esDescansoHabitual };
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
      /** Ya vio los avisos y decide programar así. */
      forzarSolapes?: boolean;
      /** Solo calcula los avisos; no guarda. */
      soloRevisar?: boolean;
    },
    companyId: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const personas = await this.cargarPersonas(tenantId);
    const userIds = [...new Set((body.userIds ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    const fechas = [...new Set((body.fechas ?? []).map((f) => String(f).slice(0, 10)))].sort();
    if (!userIds.length) throw new BadRequestException('Indica al menos una persona');
    if (!fechas.length) throw new BadRequestException('Indica al menos un día');
    if (userIds.length > 100 || fechas.length > 31) throw new BadRequestException('Son demasiados turnos de una vez');
    const hoy = workDateKey(new Date());
    if (fechas.some((f) => !esFecha(f))) throw new BadRequestException('Las fechas van como AAAA-MM-DD');
    if (fechas[0] < hoy) throw new BadRequestException('No se programan días que ya pasaron');

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
    if (!horaEntrada || !horaSalida) throw new BadRequestException('Indica a qué hora entra y a qué hora sale');
    if (horaEntrada === horaSalida) throw new BadRequestException('La entrada y la salida no pueden ser la misma hora');

    for (const id of userIds) this.exigirPrograma(actor, id, personas, 'No puedes programar el horario de esa persona');

    const turnos: TurnoProgramado[] = [];
    for (const userId of userIds) for (const fecha of fechas) turnos.push({ userId, fecha, horaEntrada, horaSalida });
    const avisos = await this.avisosDe(tenantId, turnos, personas);
    const hayAvisos = Object.values(avisos).some((l) => l.length > 0);
    if (body.soloRevisar) return { ok: true, creados: 0, avisos };
    if (hayAvisos && !body.forzarSolapes) return { ok: false, requiereConfirmacion: true, avisos, creados: 0 };

    for (const t of turnos) {
      await this.upsertDia({
        actor,
        companyId: tenantId,
        userId: t.userId,
        fecha: t.fecha,
        horaEntrada: t.horaEntrada,
        horaSalida: t.horaSalida,
        plantillaTurnoId: plantilla?.id ?? null,
        motivo: limpio(body.motivo),
        tipo: 'programar',
        avisos: soloDe(avisos, t.userId),
      });
      await this.avisarPersona(actor, t.userId, t.fecha, t.horaEntrada, t.horaSalida, tenantId);
    }
    return { ok: true, creados: turnos.length, avisos };
  }

  /** Vuelve al horario de siempre: quita lo programado para ese día. */
  async quitar(actor: Actor, body: { userId?: number; fecha?: string }, companyId: number | null) {
    const tenantId = requireCompanyId(companyId);
    const userId = Number(body.userId);
    const fecha = String(body.fecha ?? '').slice(0, 10);
    if (!esFecha(fecha)) throw new BadRequestException('fecha AAAA-MM-DD');
    if (fecha < workDateKey(new Date())) throw new BadRequestException('No se cambian días que ya pasaron');
    const personas = await this.cargarPersonas(tenantId);
    this.exigirPrograma(actor, userId, personas, 'No puedes cambiar el horario de esa persona');
    const r = await this.db.horarioDia.deleteMany({
      where: { companyId: tenantId, userId, fecha: workDateColumn(parseWorkDate(fecha)) },
    });
    if (r.count) {
      const { porDia, porPersona } = await this.horariosDe(tenantId, [userId], fecha, fecha);
      const d = this.diaDe(fecha, porDia.get(`${userId}:${fecha}`) ?? null, porPersona.get(userId) ?? null);
      if (d.trabaja) await this.avisarPersona(actor, userId, fecha, d.horario.horaEntrada, d.horario.horaSalida, tenantId);
    }
    return { ok: true, quitados: r.count };
  }

  private exigirPrograma(actor: Actor, userId: number, personas: readonly PersonaArbol[], mensaje: string) {
    const dec = puedeProgramarHorario(actor, userId, personas);
    if (dec.ok && personas.some((p) => p.id === userId)) return;
    throw new ForbiddenException(!dec.ok && dec.motivo === 'si_mismo' ? 'Nadie puede cambiarse el horario a sí mismo' : mensaje);
  }

  /** Avisos de los turnos nuevos contra lo ya citado una semana antes y después. */
  private async avisosDe(companyId: number, turnos: TurnoProgramado[], personas: readonly PersonaLista[]): Promise<AvisosProgramacion> {
    const fechas = turnos.map((t) => t.fecha).sort();
    const ids = [...new Set(turnos.map((t) => t.userId))];
    const desde = sumaDias(fechas[0], -7);
    const hasta = sumaDias(fechas[fechas.length - 1], 7);
    const { porDia, porPersona } = await this.horariosDe(companyId, ids, desde, hasta);
    const contexto: TurnoProgramado[] = [];
    for (const userId of ids) {
      for (let f = desde; f <= hasta; f = sumaDias(f, 1)) {
        const d = this.diaDe(f, porDia.get(`${userId}:${f}`) ?? null, porPersona.get(userId) ?? null);
        if (d.trabaja) contexto.push({ userId, fecha: f, horaEntrada: d.horario.horaEntrada, horaSalida: d.horario.horaSalida });
      }
    }
    const params = (await this.parametros(companyId, fechas[0])).vigente;
    const av = avisosProgramacion({
      turnos,
      contexto,
      topeExtraSemanaMin: params.topeExtraSemanaMin,
      rangoNormal: { inicio: params.rangoNormalInicio, fin: params.rangoNormalFin },
    });
    const nombre = new Map(personas.map((p) => [p.id, p.nombre]));
    const con = <T extends { userId: number }>(l: T[]) => l.map((x) => ({ ...x, nombre: nombre.get(x.userId) ?? '' }));
    return {
      solapes: con(av.solapes),
      descansoCorto: con(av.descansoCorto),
      masDe6Seguidos: con(av.masDe6Seguidos),
      extraSobreTope: con(av.extraSobreTope),
    };
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

    if (fecha < workDateKey(new Date())) throw new BadRequestException('No se cambian días que ya pasaron');
    this.exigirPrograma(actor, userId, personas, 'No puedes ajustar el horario de esa persona');

    const actual = await this.horarioDe(userId, fecha, tenantId);
    // Solo se mueve la salida citada; la hora de entrada no cambia.
    const horaEntrada = actual.horaEntrada;
    const horaSalida = hasta;
    if (horaEntrada === horaSalida) throw new BadRequestException('La entrada y la salida no pueden ser la misma hora');
    const antes = minutosEntreHm(actual.horaEntrada, actual.horaSalida);
    const ahora = minutosEntreHm(horaEntrada, horaSalida);
    if (body.tipo === 'extender' && ahora <= antes) throw new BadRequestException(`Para extender, la salida va después de las ${actual.horaSalida}`);
    if (body.tipo === 'recortar' && ahora >= antes) throw new BadRequestException(`Para terminar antes, la salida va antes de las ${actual.horaSalida}`);

    await this.upsertDia({
      actor,
      companyId: tenantId,
      userId,
      fecha,
      horaEntrada,
      horaSalida,
      plantillaTurnoId: actual.plantillaTurnoId,
      motivo:
        limpio(body.motivo) ??
        (body.tipo === 'extender' ? `Extender hasta ${hasta}` : `Terminar antes a las ${hasta}`),
      tipo: body.tipo,
      avisos: await this.avisosDe(tenantId, [{ userId, fecha, horaEntrada, horaSalida }], personas),
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

  private async cargarPersonas(companyId: number): Promise<PersonaLista[]> {
    return this.prisma.user.findMany({
      where: { isActive: true, companyMemberships: { some: { companyId } } },
      select: { id: true, nombre: true, puesto: true, avatarUrl: true, managerId: true, email: true, roleKey: true },
    });
  }
}

type PersonaLista = PersonaArbol & { nombre: string; puesto?: string | null; avatarUrl?: string | null };

const esFecha = (f: string) => /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(`${f}T00:00:00Z`));
const limpio = (t?: string | null) => (t ?? '').trim().slice(0, 500) || null;
const soloDe = (a: AvisosProgramacion, userId: number): AvisosProgramacion => ({
  solapes: a.solapes.filter((x) => x.userId === userId),
  descansoCorto: a.descansoCorto.filter((x) => x.userId === userId),
  masDe6Seguidos: a.masDe6Seguidos.filter((x) => x.userId === userId),
  extraSobreTope: a.extraSobreTope.filter((x) => x.userId === userId),
});
