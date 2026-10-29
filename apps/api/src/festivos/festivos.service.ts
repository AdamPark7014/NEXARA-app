import { BadRequestException, ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';
import { isCeoEquivalentEmail, isNonEmployeeEmail, isSuperAdminEmail } from '../common/platform-accounts.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { WORKDAY_TIMEZONE, workDateKey } from '../common/time/workday.js';
import { resolveAccessScheduleKey } from '../integra/access-schedule-defaults.js';
import { horarioDePersona } from '../me/kpis-equipo.js';
import { diaDeLaSemana, fechaColumna } from '../guardias/guardias-reglas.js';
import { leerFestivos } from './festivos-datos.js';
import {
  DIAS_DE_AVISO,
  avisoDelFestivo,
  comoLeToca,
  festivoDeLey,
  normalizaFestivo,
  sumaDiasFecha,
  type Festivo,
} from './festivos-reglas.js';

export type FestivoActor = { id: number; email?: string | null; isSuperAdmin?: boolean };

export type PersonaFestivo = { id: number; nombre: string; puesto: string | null; avatarUrl: string | null };

export const FESTIVO_FORBIDDEN = 'Solo dirección puede marcar días festivos';

/** El aviso de cada persona es una fila de `notifications`: con ella se decide «ya le avisé». */
const TIPO_AVISO = 'ATTENDANCE_UPDATE';
const ENTIDAD_AVISO = 'DiaFestivo';
/** Una consulta abarca a lo más dos años: el calendario de la pantalla es de doce meses. */
const RANGO_MAX_DIAS = 731;

/** `AAAA-MM-DD` → número para `relatedEntityId` (20261116). */
const claveNumerica = (fecha: string) => Number(fecha.replace(/-/g, ''));

/** Dirección: Christian (y equivalentes) y las cuentas de plataforma. */
export function puedeEditarFestivos(actor: FestivoActor | null | undefined): boolean {
  if (!actor) return false;
  return Boolean(actor.isSuperAdmin) || isCeoEquivalentEmail(actor.email) || isSuperAdminEmail(actor.email);
}

type Integrante = PersonaFestivo & { conHorario: boolean };

/**
 * Días festivos de la empresa. La regla de cómo le toca a cada quien vive en
 * `festivos-reglas.ts`; la usan la nómina, el desempeño, la checada y el recordatorio de entrada.
 */
@Injectable()
export class FestivosService {
  private readonly logger = new Logger(FestivosService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /** Integrantes activos de la empresa: sin cuentas de plataforma ni el equipo ficticio de la demo. */
  private async integrantes(tenantId: number): Promise<Integrante[]> {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, companyMemberships: { some: { companyId: tenantId } } },
      select: {
        id: true,
        nombre: true,
        email: true,
        puesto: true,
        avatarUrl: true,
        roleKey: true,
        tipoContrato: true,
        role: { select: { orgRoleKey: true } },
        horario: { select: { horaEntrada: true, horaSalida: true, dias: true, graciaMin: true } },
      },
      orderBy: { nombre: 'asc' },
    });
    return users
      .filter((u) => !isNonEmployeeEmail(u.email) && !/\.invalid$/i.test(String(u.email ?? '').trim()))
      .map((u) => {
        const plantilla = resolveAccessScheduleKey({
          isActive: true,
          roleKey: u.roleKey,
          orgRoleKey: u.role?.orgRoleKey ?? null,
          tipoContrato: u.tipoContrato,
        });
        return {
          id: u.id,
          nombre: u.nombre,
          puesto: u.puesto ?? null,
          avatarUrl: u.avatarUrl ?? null,
          // Dirección (24/7) no tiene horario: no se le exige nada en un festivo ni se le avisa.
          conHorario: horarioDePersona(plantilla, u.horario ?? null).entrada != null,
        };
      });
  }

  /** Festivos del rango (sin rango, de hoy a doce meses). Cualquiera del equipo los puede ver. */
  async listar(actor: FestivoActor, query: { desde?: string; hasta?: string }, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const hoy = workDateKey(new Date());
    const desde = query?.desde?.trim() || hoy;
    const hasta = query?.hasta?.trim() || sumaDiasFecha(desde, 365);
    if (diaDeLaSemana(desde) == null || diaDeLaSemana(hasta) == null) {
      throw new BadRequestException('Rango inválido: usa fechas AAAA-MM-DD');
    }
    if (hasta < desde) throw new BadRequestException('El rango termina antes de empezar');
    if (hasta > sumaDiasFecha(desde, RANGO_MAX_DIAS)) throw new BadRequestException('Consulta como máximo dos años');

    const [items, equipo] = await Promise.all([
      leerFestivos(this.prisma, tenantId, desde, hasta),
      this.integrantes(tenantId),
    ]);
    return {
      desde,
      hasta,
      hoy,
      puedeEditar: puedeEditarFestivos(actor),
      personas: equipo.filter((p) => p.conHorario).map(({ conHorario: _c, ...p }) => p),
      items,
    };
  }

  /**
   * Para las apps («Mi día»): el festivo de hoy y los próximos, ya resueltos para quien consulta
   * (si trabaja, con qué horario y si se le paga doble). La regla vive aquí, no en cada app.
   */
  async mio(actor: FestivoActor, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const hoy = workDateKey(new Date());
    const hasta = sumaDiasFecha(hoy, 90);
    const [festivos, guardias] = await Promise.all([
      leerFestivos(this.prisma, tenantId, hoy, hasta),
      this.prisma.guardia.findMany({
        where: { companyId: tenantId, userId: actor.id, fecha: { gte: fechaColumna(hoy), lte: fechaColumna(hasta) } },
        select: { fecha: true },
      }),
    ]);
    const conGuardia = new Set(guardias.map((g) => g.fecha.toISOString().slice(0, 10)));
    const resuelto = festivos.map((f) => ({
      fecha: f.fecha,
      nombre: f.nombre,
      origen: f.origen,
      finDeSemana: f.finDeSemana,
      nota: f.nota,
      como: comoLeToca(f, { userId: actor.id, conGuardia: conGuardia.has(f.fecha) }),
    }));
    return {
      hoy,
      festivoHoy: resuelto.find((f) => f.fecha === hoy) ?? null,
      // Los de fin de semana solo le importan a quien tiene guardia.
      proximos: resuelto.filter((f) => f.fecha > hoy && (!f.finDeSemana || f.como.trabaja)).slice(0, 5),
    };
  }

  /** Marca o cambia un día. Los de ley conservan su nombre y su fecha. */
  async guardar(actor: FestivoActor, fecha: string, body: Record<string, unknown>, companyId?: number | null) {
    if (!puedeEditarFestivos(actor)) throw new ForbiddenException(FESTIVO_FORBIDDEN);
    const tenantId = requireCompanyId(companyId);
    const r = normalizaFestivo(fecha, body ?? {});
    if (!r.ok) throw new BadRequestException(r.error);

    if (r.datos.personas.length) {
      const ids = new Set((await this.integrantes(tenantId)).map((p) => p.id));
      if (r.datos.personas.some((id) => !ids.has(id))) throw new BadRequestException('Alguna de esas personas no está en el equipo');
    }

    const data = { ...r.datos, actualizadoPorId: Number.isInteger(actor.id) ? actor.id : null };
    await this.prisma.diaFestivo.upsert({
      where: { companyId_fecha: { companyId: tenantId, fecha: fechaColumna(fecha) } },
      create: { companyId: tenantId, fecha: fechaColumna(fecha), ...data },
      update: data,
    });
    const [festivo] = await leerFestivos(this.prisma, tenantId, fecha, fecha);

    // Si el aviso ya salió (o ya toca), quien estaba avisado se entera del cambio ahora mismo.
    const hoy = workDateKey(new Date());
    if (festivo && festivo.avisar && fecha >= hoy && hoy >= sumaDiasFecha(fecha, -DIAS_DE_AVISO)) {
      await this.mandarAvisos(tenantId, festivo, { aunqueYaAvisado: true }).catch((e) =>
        this.logger.warn(`Aviso del festivo ${fecha}: ${e instanceof Error ? e.message : String(e)}`),
      );
    }
    return festivo ?? null;
  }

  /** Quita lo que dirección marcó: un día de la empresa desaparece; uno de ley vuelve a «no se labora». */
  async quitar(actor: FestivoActor, fecha: string, companyId?: number | null) {
    if (!puedeEditarFestivos(actor)) throw new ForbiddenException(FESTIVO_FORBIDDEN);
    const tenantId = requireCompanyId(companyId);
    if (diaDeLaSemana(fecha) == null) throw new BadRequestException('Elige un día válido (AAAA-MM-DD).');
    const { count } = await this.prisma.diaFestivo.deleteMany({ where: { companyId: tenantId, fecha: fechaColumna(fecha) } });
    return { quitado: count > 0, fecha, deLey: festivoDeLey(fecha) != null };
  }

  /** A las 10:00 (y a las 13:00, por si el servidor no estaba): avisos de los festivos de los próximos días. */
  @Cron('0 10,13 * * *', { name: 'festivos-aviso', timeZone: WORKDAY_TIMEZONE })
  async avisarProximos() {
    await runScheduledJob('festivos:aviso', this.logger, () => this.enviarAvisos(new Date()));
  }

  /** Expuesto para las pruebas. Devuelve cuántos avisos creó. */
  async enviarAvisos(ahora: Date): Promise<number> {
    const hoy = workDateKey(ahora);
    const hasta = sumaDiasFecha(hoy, DIAS_DE_AVISO);
    const empresas = await this.prisma.companyProfile.findMany({ select: { id: true } });
    let total = 0;
    for (const { id: companyId } of empresas) {
      // Desde mañana: el de hoy ya no se avisa.
      const proximos = (await leerFestivos(this.prisma, companyId, sumaDiasFecha(hoy, 1), hasta)).filter((f) => f.avisar);
      for (const f of proximos) total += await this.mandarAvisos(companyId, f);
    }
    if (total) this.logger.log(`Avisos de festivos ${hoy}: ${total}`);
    return total;
  }

  /**
   * Un aviso por persona: cómo le toca el día. Entre semana, a todo el equipo con horario; en fin
   * de semana, solo a quien tiene guardia (los demás ya descansan).
   */
  private async mandarAvisos(companyId: number, f: Festivo, opts: { aunqueYaAvisado?: boolean } = {}): Promise<number> {
    if (!this.notifications) return 0;
    const equipo = (await this.integrantes(companyId)).filter((p) => p.conHorario);
    const conGuardia = f.finDeSemana
      ? new Set(
          (
            await this.prisma.guardia.findMany({
              where: { companyId, fecha: fechaColumna(f.fecha) },
              select: { userId: true },
            })
          ).map((g) => g.userId),
        )
      : new Set<number>();
    const destinatarios = f.finDeSemana ? equipo.filter((p) => conGuardia.has(p.id)) : equipo;
    if (!destinatarios.length) return 0;

    const yaAvisados = opts.aunqueYaAvisado
      ? new Set<number>()
      : new Set(
          (
            await this.prisma.notification.findMany({
              where: {
                userId: { in: destinatarios.map((p) => p.id) },
                type: TIPO_AVISO,
                entityType: ENTIDAD_AVISO,
                relatedEntityId: claveNumerica(f.fecha),
              },
              select: { userId: true },
            })
          ).map((n) => n.userId),
        );

    let creados = 0;
    for (const p of destinatarios) {
      if (yaAvisados.has(p.id)) continue;
      const como = comoLeToca(f, { userId: p.id, conGuardia: conGuardia.has(p.id) });
      const { title, message } = avisoDelFestivo(f, como);
      const fila = await this.notifications
        .createNotification({
          userId: p.id,
          type: TIPO_AVISO,
          category: 'attendance',
          title,
          message,
          icon: 'aviso',
          relatedEntityId: claveNumerica(f.fecha),
          entityType: ENTIDAD_AVISO,
          relatedUrl: '/erp/asistencias?tab=festivos',
          // Quien trabaja lo debe ver aunque tenga «solo el resumen».
          priority: como.trabaja ? 'high' : 'normal',
          channel: 'attendance',
          collapseKey: `nx_festivo_${claveNumerica(f.fecha)}_u${p.id}`,
          dedupeSeconds: 0,
          companyId,
        })
        .catch((e) => {
          this.logger.warn(`Aviso del festivo ${f.fecha} a u${p.id}: ${e instanceof Error ? e.message : String(e)}`);
          return null;
        });
      if (fila) creados += 1;
    }
    return creados;
  }
}
