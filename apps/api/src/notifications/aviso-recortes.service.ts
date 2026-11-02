import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';
import { PLATFORM_DEVELOPER_EMAIL } from '../common/platform-accounts.js';
import { WORKDAY_TIMEZONE } from '../common/time/workday.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ENTIDAD_RECORTE, resolveRowCap } from '../prisma/row-cap.js';
import { NotificationsService } from './notifications.service.js';

export const CATEGORIA_AVISO_RECORTES = 'recortes-filas';

/** Lo más viejo que todavía avisa, si nunca se ha mandado una tarjeta. */
const VENTANA_MS = 7 * 24 * 60 * 60 * 1000;
/** Consultas que caben en una tarjeta; el resto, en la base. */
const MAX_CONSULTAS = 5;

/**
 * Título y mensaje de la tarjeta, o `null` si no hay nada que avisar.
 *
 * Una fila con otro tope es una prueba con `PRISMA_MAX_ROWS` bajado a mano, no un recorte real.
 */
export function textoAvisoRecortes(
  cambios: unknown[],
  tope: number,
): { title: string; message: string } | null {
  const veces = new Map<string, number>();
  for (const cambio of cambios) {
    const c = cambio as { modelo?: unknown; tope?: unknown; filtro?: unknown; veces?: unknown } | null;
    if (typeof c?.modelo !== 'string' || c.tope !== tope) continue;
    const filtro = Array.isArray(c.filtro) && c.filtro.length ? `filtrando ${c.filtro.join(', ')}` : 'sin filtro';
    const consulta = `${c.modelo} ${filtro}`;
    veces.set(consulta, (veces.get(consulta) ?? 0) + (Number(c.veces) || 1));
  }
  if (!veces.size) return null;

  const consultas = [...veces.entries()].sort((a, b) => b[1] - a[1]);
  const lista = consultas
    .slice(0, MAX_CONSULTAS)
    .map(([consulta, n]) => `${consulta} (${n} ${n === 1 ? 'vez' : 'veces'})`)
    .join('; ');
  const resto = consultas.length - MAX_CONSULTAS;
  return {
    title: 'Hay listas que salieron incompletas',
    message:
      `Se cortaron al tope de ${tope.toLocaleString('es-MX')} filas: ${lista}` +
      `${resto > 0 ? `; y ${resto} más` : ''}. Hay que paginar esas consultas.`,
  };
}

/**
 * Cada mañana, una tarjeta a la cuenta de desarrollo si hubo recortes nuevos del tope de filas
 * (`prisma/row-cap.ts`). Si no los hubo, no manda nada. Va a `developer@` y no a dirección porque
 * lo único que se puede hacer con ella es corregir la consulta.
 */
@Injectable()
export class AvisoRecortesService {
  private readonly logger = new Logger(AvisoRecortesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 9 * * 1-6', { name: 'aviso-recortes', timeZone: WORKDAY_TIMEZONE })
  async correr() {
    await runScheduledJob('avisos:recortes', this.logger, () => this.revisar());
  }

  /** Expuesto para las pruebas. Dice si salió la tarjeta. */
  async revisar(ahora = new Date()): Promise<boolean> {
    const destino = await this.prisma.user.findFirst({
      where: { email: PLATFORM_DEVELOPER_EMAIL, isActive: true },
      select: { id: true },
    });
    if (!destino) {
      this.logger.warn(`Sin cuenta activa ${PLATFORM_DEVELOPER_EMAIL}: no se avisó de los recortes`);
      return false;
    }

    // Solo lo nuevo desde la última tarjeta: así un reinicio no la repite, y lo del domingo sale el lunes.
    const ultima = await this.prisma.notification.findFirst({
      where: { userId: destino.id, category: CATEGORIA_AVISO_RECORTES },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const limite = ahora.getTime() - VENTANA_MS;
    const desde = new Date(Math.max(ultima?.createdAt.getTime() ?? limite, limite));

    const filas = await this.prisma.auditLog.findMany({
      where: { entityType: ENTIDAD_RECORTE, entityId: 0, createdAt: { gt: desde } },
      select: { changes: true },
      orderBy: { id: 'desc' },
      take: 1000,
    });
    const texto = textoAvisoRecortes(filas.map((f) => f.changes), resolveRowCap());
    if (!texto) return false;

    await this.notifications.createNotification({
      userId: destino.id,
      // Sin tipo propio (exigiría migrar el enum): igual que el resumen del CEO; la categoría lo distingue.
      type: 'WORKFLOW_PENDING',
      category: CATEGORIA_AVISO_RECORTES,
      title: texto.title,
      message: texto.message,
      entityType: ENTIDAD_RECORTE,
      relatedUrl: '/erp/notifications-center',
      collapseKey: `nx_recortes_u${destino.id}`,
      entrega: 'siempre',
      dedupeSeconds: 0,
    });
    this.logger.log(`Aviso de recortes enviado: ${texto.message}`);
    return true;
  }
}
