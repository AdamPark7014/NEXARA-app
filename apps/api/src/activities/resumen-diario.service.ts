import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChatService } from '../chat/chat.service.js';
import { WORKDAY_TIMEZONE } from '../common/time/workday.js';
import { DIRECCION_GENERAL_EMAIL, PLATFORM_DEVELOPER_EMAIL, PLATFORM_OWNER_EMAIL } from '../common/platform-accounts.js';
import { hayAlgoQueResumir, resumenDiarioEncendido, textoResumenDiario, type DatosResumenDiario } from './resumen-diario.js';

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Cada mañana le llega a dirección, por el chat de la plataforma, lo que se cerró o detectó solo en las
 * últimas 24 horas. Si no pasó nada no se manda nada. Lo escribe la cuenta de plataforma.
 */
@Injectable()
export class ResumenDiarioService {
  private readonly logger = new Logger(ResumenDiarioService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly chat?: ChatService,
  ) {}

  @Cron('30 8 * * *', { name: 'resumen-diario-direccion', timeZone: WORKDAY_TIMEZONE })
  async cron() {
    if (process.env.NEXARA_RELEVO === '1' || !resumenDiarioEncendido()) return;
    try {
      const r = await this.enviar();
      if (r.enviados) this.logger.log(`Resumen diario: ${r.enviados} mensaje(s)`);
    } catch (error) {
      this.logger.error('Resumen diario falló', error as Error);
    }
  }

  /** Datos de una empresa en las 24 horas anteriores a `ahora`. */
  async datos(companyId: number, ahora: Date = new Date()): Promise<DatosResumenDiario> {
    const desde = new Date(ahora.getTime() - DIA_MS);
    const cierres = await this.prisma.activityNonCompliance.findMany({
      where: { companyId, origen: 'CIERRE_JORNADA', registradoAt: { gte: desde, lte: ahora } },
      select: { pendientesIds: true, activity: { select: { id: true, anNumber: true, titulo: true } } },
      orderBy: { registradoAt: 'asc' },
      take: 200,
    });
    const salidasAuto = await this.prisma.attendance.findMany({
      where: { companyId, type: 'salida', cierreAutomatico: true, timestamp: { gte: desde, lte: ahora } },
      select: { userId: true },
      take: 200,
    });
    const corriendo = await this.prisma.activityWorkSession.findMany({
      where: { companyId, endedAt: null },
      select: { userId: true },
      take: 200,
    });
    const abiertas = await this.prisma.attendanceDay.findMany({
      where: { companyId, isOpen: true },
      select: { userId: true },
    });
    const conJornada = new Set(abiertas.map((d) => d.userId));
    const sinEntradaIds = [...new Set(corriendo.map((s) => s.userId))].filter((id) => !conJornada.has(id));
    const porValidarAtrasadas = await this.prisma.activityEvidence.count({
      where: { companyId, status: 'COMPLETED', reviewStatus: 'PENDING', completedAt: { lte: desde } },
    });

    const ids = new Set<number>([
      ...cierres.flatMap((c) => c.pendientesIds),
      ...salidasAuto.map((s) => s.userId),
      ...sinEntradaIds,
    ]);
    const gente = ids.size
      ? await this.prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, nombre: true } })
      : [];
    const nombre = new Map(gente.map((u) => [u.id, u.nombre ?? `#${u.id}`]));
    const nombres = (lista: number[]) => lista.map((id) => nombre.get(id)).filter((n): n is string => Boolean(n));

    return {
      noCumplidas: cierres.map((c) => ({
        id: c.activity.id,
        anNumber: c.activity.anNumber,
        titulo: c.activity.titulo ?? '',
        personas: nombres(c.pendientesIds),
      })),
      jornadasCerradasSolas: nombres(salidasAuto.map((s) => s.userId)),
      trabajandoSinEntrada: nombres(sinEntradaIds),
      porValidarAtrasadas,
    };
  }

  /** Manda el resumen de cada empresa a dirección. Devuelve cuántos mensajes salieron. */
  async enviar(ahora: Date = new Date()): Promise<{ enviados: number }> {
    if (!this.chat) return { enviados: 0 };
    const [remitente, destinatarios, empresas] = await Promise.all([
      this.prisma.user.findFirst({ where: { email: PLATFORM_DEVELOPER_EMAIL }, select: { id: true } }),
      this.prisma.user.findMany({
        where: { email: { in: [PLATFORM_OWNER_EMAIL, DIRECCION_GENERAL_EMAIL] } },
        select: { id: true },
      }),
      this.prisma.activityNonCompliance.findMany({
        where: { registradoAt: { gte: new Date(ahora.getTime() - 7 * DIA_MS) } },
        select: { companyId: true },
        distinct: ['companyId'],
      }),
    ]);
    if (!remitente || !destinatarios.length) return { enviados: 0 };

    let enviados = 0;
    for (const { companyId } of empresas) {
      const d = await this.datos(companyId, ahora);
      if (!hayAlgoQueResumir(d)) continue;
      const texto = textoResumenDiario(d);
      for (const para of destinatarios) {
        const ok = await this.chat.avisoDirecto(remitente.id, para.id, texto, companyId);
        if (ok) enviados += 1;
      }
    }
    return { enviados };
  }
}
