import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CEO_EQUIVALENT_EMAILS } from '../common/platform-accounts.js';
import { appUrls } from '../common/app-urls.js';
import { WORKDAY_TIMEZONE } from '../common/time/workday.js';
import {
  cadenaParticipantes,
  folioBase,
  folioEnviado,
  nomenclaturaParaFolio,
  siglasDeNomenclatura,
} from './folio-core.js';
import { ESTADO, ETIQUETA_ESTADO, debeVencer, estadoDesdeDb } from './estado-cotizacion.js';

export type RolParticipante = 'ELABORO' | 'LEVANTAMIENTO' | 'REVISO' | 'APROBO' | 'ENVIO';

export const ETIQUETA_ROL: Record<RolParticipante, string> = {
  ELABORO: 'Elaboró',
  LEVANTAMIENTO: 'Levantamiento',
  REVISO: 'Revisó',
  APROBO: 'Aprobó',
  ENVIO: 'Envió',
};

export type ClaveDePersona = {
  userId: number;
  nombre: string;
  /** Nomenclatura con la que se emite el folio (clave de RH o rellenada con ceros). */
  clave: string;
  siglas: string;
};

/**
 * Folio, participantes y ciclo de vida de las cotizaciones de Core.
 *
 * El folio lo fija el servidor a partir de la nomenclatura de quien cotiza y de **su** contador
 * (`cotizacion_contadores`), en transacción: antes se armaba en el cliente y dos pestañas abiertas
 * podían mandar el mismo número.
 */
@Injectable()
export class CotizacionesCoreService {
  private readonly logger = new Logger(CotizacionesCoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Nomenclatura y siglas de una persona, con lo que haya en su expediente. */
  async claveDePersona(userId: number): Promise<ClaveDePersona | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nombre: true,
        employeeNumber: true,
        fechaIngreso: true,
        perfil: { select: { curp: true, fechaNacimiento: true } },
      },
    });
    if (!user) return null;

    const clave = nomenclaturaParaFolio({
      nombre: user.nombre,
      employeeNumber: user.employeeNumber,
      curp: user.perfil?.curp ?? null,
      fechaNacimiento: user.perfil?.fechaNacimiento ?? null,
      fechaIngreso: user.fechaIngreso ?? null,
    });

    return { userId: user.id, nombre: user.nombre, clave, siglas: siglasDeNomenclatura(clave) };
  }

  /**
   * Siguiente folio de esa persona.
   *
   * El contador se incrementa en su propia fila, así que dos cotizaciones simultáneas de la misma
   * persona no pueden quedarse con el mismo número; si dos hilos crean la fila a la vez, el segundo
   * reintenta sobre la ya existente.
   */
  async siguienteFolio(userId: number): Promise<{ folio: string; nomenclatura: string; consecutivo: number }> {
    const persona = await this.claveDePersona(userId);
    const nomenclatura = persona?.clave ?? 'XX00000000';

    let consecutivo = 0;
    for (let intento = 0; intento < 3 && !consecutivo; intento += 1) {
      try {
        const fila = await this.prisma.cotizacionContador.upsert({
          where: { userId },
          create: { userId, ultimo: 1 },
          update: { ultimo: { increment: 1 } },
          select: { ultimo: true },
        });
        consecutivo = fila.ultimo;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
    }
    if (!consecutivo) {
      const fila = await this.prisma.cotizacionContador.update({
        where: { userId },
        data: { ultimo: { increment: 1 } },
        select: { ultimo: true },
      });
      consecutivo = fila.ultimo;
    }

    return { folio: folioBase(nomenclatura, consecutivo), nomenclatura, consecutivo };
  }

  /** Registra (o deja como estaba) el papel de alguien en la cotización. */
  async registrarParticipante(cotizacionId: number, userId: number | null | undefined, rol: RolParticipante) {
    if (!userId) return null;
    const persona = await this.claveDePersona(userId);
    if (!persona) return null;

    try {
      return await this.prisma.cotizacionParticipante.upsert({
        where: { cotizacionId_userId_rol: { cotizacionId, userId, rol } },
        create: { cotizacionId, userId, clave: persona.clave, siglas: persona.siglas, rol },
        update: {},
      });
    } catch (error) {
      this.logger.warn(`No se pudo registrar participante ${userId} (${rol}): ${String(error)}`);
      return null;
    }
  }

  async participantes(cotizacionId: number) {
    return this.prisma.cotizacionParticipante.findMany({
      where: { cotizacionId },
      orderBy: { at: 'asc' },
      include: { user: { select: { id: true, nombre: true, avatarUrl: true, puesto: true } } },
    });
  }

  /** Participantes listos para la web y las apps (quién, con qué papel y cuándo). */
  async participantesParaApi(cotizacionId: number) {
    const filas = await this.participantes(cotizacionId);
    return filas.map((p) => ({
      userId: p.userId,
      nombre: p.user?.nombre ?? '',
      puesto: p.user?.puesto ?? null,
      avatarUrl: p.user?.avatarUrl ?? null,
      clave: p.clave,
      siglas: p.siglas,
      rol: p.rol as RolParticipante,
      rolEtiqueta: ETIQUETA_ROL[p.rol as RolParticipante] ?? String(p.rol),
      at: p.at,
    }));
  }

  /**
   * Folio con el que sale la cotización: base + siglas de quienes intervinieron + revisión.
   *
   * Quien la elaboró ya está en el folio (es su nomenclatura), así que la cadena son los demás, en
   * el orden en que participaron.
   */
  async folioParaEnvio(cotizacionId: number, base: string, autorUserId: number | null, revision: number) {
    const filas = await this.participantes(cotizacionId);
    const autor = autorUserId
      ? filas.find((p) => p.userId === autorUserId)?.siglas ??
        (await this.claveDePersona(autorUserId))?.siglas ??
        ''
      : '';
    const otros = filas.filter((p) => p.userId !== autorUserId).map((p) => p.siglas);
    return folioEnviado({ base, siglasAutor: autor, participantes: otros, revision });
  }

  /** Cadena de siglas (para mostrarla en la lista sin recalcular el folio). */
  async cadenaDeParticipantes(cotizacionId: number, autorUserId: number | null) {
    const filas = await this.participantes(cotizacionId);
    const autor = autorUserId ? filas.find((p) => p.userId === autorUserId)?.siglas ?? '' : '';
    return cadenaParticipantes(
      autor,
      filas.filter((p) => p.userId !== autorUserId).map((p) => p.siglas),
    );
  }

  /** Jefes por organigrama de alguien (hacia arriba) más dirección. */
  async jefesYDireccion(userId: number | null | undefined): Promise<number[]> {
    const destinos = new Set<number>();
    try {
      if (userId) {
        let actual: number | null = userId;
        const vistos = new Set<number>([userId]);
        for (let nivel = 0; nivel < 8 && actual != null; nivel += 1) {
          const fila: { managerId: number | null } | null = await this.prisma.user.findUnique({
            where: { id: actual },
            select: { managerId: true },
          });
          const jefe: number | null = fila?.managerId ?? null;
          if (!jefe || vistos.has(jefe)) break;
          vistos.add(jefe);
          destinos.add(jefe);
          actual = jefe;
        }
      }

      const direccion = await this.prisma.user.findMany({
        where: { email: { in: [...CEO_EQUIVALENT_EMAILS] }, isActive: true },
        select: { id: true },
      });
      for (const d of direccion) destinos.add(d.id);
    } catch (error) {
      this.logger.warn(`No se pudieron resolver los jefes de ${userId}: ${String(error)}`);
    }

    if (userId) destinos.delete(userId);
    return [...destinos];
  }

  /**
   * Aviso de cotización a quien la hizo, sus jefes y dirección.
   *
   * El contrato lo pide para enviada, aprobada y rechazada: en Core una cotización es trabajo de
   * alguien, y su cadena de mando tiene que enterarse sin preguntar.
   */
  async avisar(params: {
    cotizacionId: number;
    quoteNumber: string;
    tipo: 'QUOTE_SENT' | 'QUOTE_SIGNED' | 'QUOTE_REJECTED' | 'QUOTE_EXPIRED';
    titulo: string;
    mensaje: string;
    autorId?: number | null;
    actorId?: number | null;
    companyId?: number | null;
  }) {
    const destinos = new Set<number>();
    if (params.autorId) destinos.add(params.autorId);
    for (const id of await this.jefesYDireccion(params.autorId)) destinos.add(id);

    for (const userId of destinos) {
      await this.notifications
        .createNotification({
          userId,
          type: params.tipo,
          category: 'sales',
          title: params.titulo,
          message: params.mensaje,
          entityType: 'COTIZACION',
          relatedEntityId: params.cotizacionId,
          relatedUrl: appUrls.erpCotizaciones(params.cotizacionId),
          triggerUserId: params.actorId ?? undefined,
          companyId: params.companyId ?? undefined,
        } as any)
        .catch(() => undefined);
    }
  }

  /**
   * Tarea diaria: marca vencidas las enviadas cuya vigencia ya pasó.
   *
   * Sin esto, `validUntil` era decorativo: una cotización de hace tres meses seguía en «Enviada» y
   * podía firmarse desde el enlace.
   */
  @Cron('0 6 * * *', { name: 'cotizaciones-vencidas', timeZone: WORKDAY_TIMEZONE })
  async marcarVencidas(hoy: Date = new Date()): Promise<number> {
    const candidatas = await this.prisma.cotizacion.findMany({
      where: { status: 'SENT', validUntil: { not: null, lt: hoy }, deletedAt: null },
      select: { id: true, quoteNumber: true, validUntil: true, createdById: true, companyId: true, status: true },
    });

    let marcadas = 0;
    for (const quote of candidatas) {
      if (!debeVencer({ estado: quote.status, validUntil: quote.validUntil, hoy })) continue;
      await this.prisma.cotizacion.update({
        where: { id: quote.id },
        data: { status: 'EXPIRED', expiredAt: hoy },
      });
      marcadas += 1;
      await this.avisar({
        cotizacionId: quote.id,
        quoteNumber: quote.quoteNumber,
        tipo: 'QUOTE_EXPIRED',
        titulo: 'Cotización vencida',
        mensaje: `La cotización ${quote.quoteNumber} venció sin respuesta del cliente.`,
        autorId: quote.createdById,
        companyId: quote.companyId,
      });
    }

    if (marcadas) this.logger.log(`Cotizaciones marcadas como vencidas: ${marcadas}`);
    return marcadas;
  }

  /** Etiqueta en español del estado guardado. */
  etiquetaEstado(status: unknown): { estado: string; etiqueta: string } {
    const estado = estadoDesdeDb(status);
    return { estado, etiqueta: ETIQUETA_ESTADO[estado] ?? ESTADO.BORRADOR };
  }
}
