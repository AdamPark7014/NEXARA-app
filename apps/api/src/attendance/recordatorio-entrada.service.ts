import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PushDispatchService } from '../devices/push-dispatch.service.js';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';
import { isNonEmployeeEmail } from '../common/platform-accounts.js';
import { workDateColumn, workDateKey, workDayBounds } from '../common/time/workday.js';
import { horaAviso } from '../notifications/notification-push-meta.js';
import { resolveAccessScheduleKey } from '../integra/access-schedule-defaults.js';
import { horarioDePersona, type HorarioKpi } from '../me/kpis-equipo.js';
import { esSabadoODomingo } from '../guardias/guardias-reglas.js';
import { primerNombre } from '../celebrations/celebraciones.js';
import {
  PREF_RECORDATORIO_ENTRADA,
  avisoBuenosDias,
  avisoQueToca,
  avisoSinEntrada,
  horaDeEntrada,
  type DiaDeLaPersona,
} from './recordatorio-entrada.js';
import { leerFestivos } from '../festivos/festivos-datos.js';
import { comoLeToca, type Festivo } from '../festivos/festivos-reglas.js';

/** El «buenos días» es la única fila del día: así se sabe a quién ya se saludó. */
const TIPO = 'ATTENDANCE_ABSENCE';
const ENTIDAD = 'RecordatorioEntrada';
const URL_ASISTENCIA = '/erp/asistencias';

/** Una sola tarjeta por persona en el teléfono: cada aviso reemplaza al anterior y vuelve a sonar. */
const llaveDeTarjeta = (userId: number) => `nx_entrada_u${userId}`;

type Candidato = { id: number; nombre: string; companyId: number | null; horario: HorarioKpi; festivo: Festivo | null };

/**
 * Cada minuto, solo a quien no ha checado: «buenos días» a su hora de entrada y un push cada 2 min
 * desde su entrada más la tolerancia hasta su salida. Reglas en `recordatorio-entrada.ts`. En cuanto
 * checa lo toma `activities/recordatorios-jornada.service.ts` («sin actividad», «por vencer»).
 *
 * La insistencia va directo por `PushDispatchService`, no por `createNotification` como aquel: cada
 * aviso de 2 min sería una fila nueva en `notifications` (más de cien por persona en un día sin checar).
 *
 * Varias instancias de la API corren este cron a la vez: cada aviso se reclama antes de mandarlo
 * con una escritura condicional sobre la fila de la persona en `user_preferences` (solo una gana
 * el turno). Ni esa tabla ni `notifications` pasan por `audit_logs`.
 */
@Injectable()
export class RecordatorioEntradaService {
  private readonly logger = new Logger(RecordatorioEntradaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly push: PushDispatchService,
  ) {}

  @Cron('* * * * *', { name: 'asistencia-recordatorio-entrada' })
  async correr() {
    await runScheduledJob('asistencia:recordatorio-entrada', this.logger, () => this.revisar());
  }

  /** Expuesto para las pruebas. Devuelve a quién le mandó cada aviso. */
  async revisar(ahora = new Date()): Promise<{ buenosDias: number[]; sinEntrada: number[] }> {
    const enviados = { buenosDias: [] as number[], sinEntrada: [] as number[] };
    const fecha = workDateKey(ahora);
    const finDeSemana = esSabadoODomingo(fecha);

    const usuarios = await this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        nombre: true,
        email: true,
        roleKey: true,
        tipoContrato: true,
        role: { select: { orgRoleKey: true } },
        horario: { select: { horaEntrada: true, horaSalida: true, dias: true, graciaMin: true } },
        companyMemberships: { select: { companyId: true, isDefault: true } },
      },
    });

    // El festivo de hoy de cada empresa (los de ley salen solos; dirección pudo cambiarlos).
    const empresaDe = (u: (typeof usuarios)[number]) =>
      [...u.companyMemberships].sort((a, b) => Number(b.isDefault) - Number(a.isDefault))[0]?.companyId ?? null;
    const empresas = [...new Set(usuarios.map(empresaDe).filter((id): id is number => id != null))];
    const festivoDe = new Map<number, Festivo | null>(
      await Promise.all(
        empresas.map(async (id) => [id, (await leerFestivos(this.prisma, id, fecha, fecha))[0] ?? null] as const),
      ),
    );

    // Primero, sin consultar nada más, quién podría estar en su ventana (en fin de semana, como si
    // tuviera guardia): de noche y fuera de horario la corrida termina aquí.
    const candidatos: Candidato[] = [];
    for (const u of usuarios) {
      // Cuentas de plataforma y el equipo ficticio del tenant de demo de las tiendas (`@demo.invalid`).
      if (isNonEmployeeEmail(u.email) || /\.invalid$/i.test(u.email.trim())) continue;
      const plantilla = resolveAccessScheduleKey({
        isActive: true,
        roleKey: u.roleKey,
        orgRoleKey: u.role?.orgRoleKey ?? null,
        tipoContrato: u.tipoContrato,
      });
      const horario = horarioDePersona(plantilla, u.horario ?? null);
      const empresa = empresaDe(u);
      const festivo = empresa != null ? (festivoDe.get(empresa) ?? null) : null;
      const posible: DiaDeLaPersona = {
        fecha,
        horario,
        conGuardia: finDeSemana,
        justificada: false,
        conPermiso: false,
        festivo: festivo ? comoLeToca(festivo, { userId: u.id, conGuardia: finDeSemana }) : null,
      };
      if (!avisoQueToca(ahora, posible, { yaEntro: false, yaSaludado: false })) continue;
      candidatos.push({ id: u.id, nombre: u.nombre, companyId: empresa, horario, festivo });
    }
    if (!candidatos.length) return enviados;

    const ids = candidatos.map((c) => c.id);
    const hoy = workDateColumn(ahora);
    const { start, end } = workDayBounds(ahora);
    const [entradas, jornadas, justificadas, permisos, guardias, saludos, prefs] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { userId: { in: ids }, type: 'entrada', timestamp: { gte: start, lte: end } },
        select: { userId: true },
      }),
      // La señal con la que `recordatorios-jornada` decide que alguien ya está en jornada: con ella
      // aquí se calla, y nadie recibe los dos recordatorios a la vez.
      this.prisma.attendanceDay.findMany({ where: { userId: { in: ids }, date: hoy }, select: { userId: true } }),
      this.prisma.attendanceJustification.findMany({
        where: { userId: { in: ids }, date: hoy },
        select: { userId: true },
      }),
      this.prisma.leaveRequest.findMany({
        where: { userId: { in: ids }, status: 'APPROVED', startDate: { lte: hoy }, endDate: { gte: hoy } },
        select: { userId: true },
      }),
      finDeSemana
        ? this.prisma.guardia.findMany({ where: { userId: { in: ids }, fecha: hoy }, select: { userId: true } })
        : Promise.resolve([] as Array<{ userId: number }>),
      this.prisma.notification.findMany({
        where: { userId: { in: ids }, type: TIPO, entityType: ENTIDAD, createdAt: { gte: start } },
        select: { userId: true },
      }),
      this.prisma.userPreference.findMany({
        where: { userId: { in: ids }, key: PREF_RECORDATORIO_ENTRADA },
        select: { userId: true, value: true },
      }),
    ]);

    const yaEntraron = new Set([...entradas, ...jornadas].map((e) => e.userId));
    const conJustificacion = new Set(justificadas.map((j) => j.userId));
    const conPermiso = new Set(permisos.map((p) => p.userId));
    const conGuardia = new Set(guardias.map((g) => g.userId));
    const saludados = new Set(saludos.map((n) => n.userId));
    const turnoPrevio = new Map(prefs.map((p) => [p.userId, p.value]));

    for (const c of candidatos) {
      const toca = avisoQueToca(
        ahora,
        {
          fecha,
          horario: c.horario,
          conGuardia: conGuardia.has(c.id),
          justificada: conJustificacion.has(c.id),
          conPermiso: conPermiso.has(c.id),
          festivo: c.festivo ? comoLeToca(c.festivo, { userId: c.id, conGuardia: conGuardia.has(c.id) }) : null,
        },
        { yaEntro: yaEntraron.has(c.id), yaSaludado: saludados.has(c.id) },
      );
      if (!toca) continue;
      if (!(await this.reclamar(c.id, toca.turno, turnoPrevio.get(c.id)))) continue;

      const horario = horaDeEntrada(ahora, toca.entrada);
      try {
        if (toca.aviso === 'buenos-dias') {
          const { title, message } = avisoBuenosDias({ nombre: c.nombre, horario, minutosTarde: toca.minutosTarde });
          const fila = await this.notifications.createNotification({
            userId: c.id,
            type: TIPO,
            category: 'attendance',
            title,
            message,
            icon: 'entrada',
            relatedEntityId: c.id,
            entityType: ENTIDAD,
            relatedUrl: URL_ASISTENCIA,
            priority: 'high',
            channel: 'attendance',
            collapseKey: llaveDeTarjeta(c.id),
            dedupeSeconds: 0,
            companyId: c.companyId,
          });
          if (fila) enviados.buenosDias.push(c.id);
        } else {
          const { title, message } = avisoSinEntrada({ horario, minutosTarde: toca.minutosTarde });
          const llave = llaveDeTarjeta(c.id);
          // Solo push: repetirlo cada 2 min no deja filas en la campana.
          await this.push.sendToUser(c.id, {
            title,
            body: message,
            relatedUrl: URL_ASISTENCIA,
            priority: 'high',
            tag: llave,
            collapseKey: llave,
            threadId: llave,
            reemplazar: true,
            channel: 'attendance',
            event: TIPO,
            entityType: ENTIDAD,
            relatedEntityId: c.id,
            category: 'attendance',
            kind: 'event',
            icon: 'entrada_tarde',
          });
          enviados.sinEntrada.push(c.id);
        }
      } catch (error) {
        this.logger.warn(
          `Recordatorio de entrada u${c.id} (${toca.aviso}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (enviados.buenosDias.length || enviados.sinEntrada.length) {
      const nombres = (lista: number[]) =>
        lista.map((id) => `u${id} ${primerNombre(candidatos.find((c) => c.id === id)?.nombre)}`).join(', ');
      this.logger.log(
        `Recordatorio de entrada ${horaAviso(ahora)}: buenos días ${enviados.buenosDias.length} [${nombres(enviados.buenosDias)}]` +
          ` · sin entrada ${enviados.sinEntrada.length} [${nombres(enviados.sinEntrada)}]`,
      );
    }
    return enviados;
  }

  /**
   * Gana el turno quien logra escribirlo: la fila se actualiza solo si el turno guardado es anterior
   * (Postgres lo resuelve fila por fila, así que de dos instancias solo una cuenta 1). Sin fila, la
   * crea; si otra la creó al mismo tiempo, choca con la llave única y pierde.
   */
  private async reclamar(userId: number, turno: string, previo: string | undefined): Promise<boolean> {
    if (previo != null && previo >= turno) return false;
    if (previo != null) {
      const { count } = await this.prisma.userPreference.updateMany({
        where: { userId, key: PREF_RECORDATORIO_ENTRADA, value: { lt: turno } },
        data: { value: turno },
      });
      return count === 1;
    }
    try {
      await this.prisma.userPreference.create({ data: { userId, key: PREF_RECORDATORIO_ENTRADA, value: turno } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
      throw error;
    }
  }
}
