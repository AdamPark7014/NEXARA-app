import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';
import { WORKDAY_TIMEZONE, workDateColumn, workDayStart } from '../common/time/workday.js';
import {
  ESTADOS_OC_POR_RECIBIR,
  claveAvisoOc,
  planificarAvisosOcAtrasadas,
  type OrdenParaAtraso,
} from './purchase-order-overdue.js';

/** Categoría del aviso: sirve también para saber si hoy ya se envió el resumen. */
export const CATEGORIA_OC_ATRASADAS = 'compras-atrasadas';

/** Tope de órdenes por corrida; van primero las más atrasadas. */
const MAX_ORDENES = 1000;

/**
 * Aviso diario de órdenes de compra atrasadas (lunes a viernes, 9:30 hora de México).
 *
 * Complementa —no reemplaza— `CronService.handlePOReminders`, que avisa por correo de las órdenes
 * que están **por llegar**. Aquí sólo entran las que ya pasaron su fecha esperada sin recibirse
 * por completo, así que los dos avisos nunca hablan de la misma orden el mismo día.
 *
 * Reparte un solo resumen por persona: quien compró y sus jefes por organigrama. La regla de
 * quién recibe qué vive en `purchase-order-overdue.ts` (función pura con pruebas); esta clase
 * sólo trae los datos, calcula los jefes de cada empresa y entrega los avisos.
 */
@Injectable()
export class PurchaseOrderOverdueCronService {
  private readonly logger = new Logger(PurchaseOrderOverdueCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly hierarchy: NotificationHierarchyService,
  ) {}

  // Sin `timeZone` el cron usaría la del proceso (UTC en el contenedor): el aviso saldría de madrugada.
  // 9:30 para no coincidir con el recordatorio de evidencias de las 9:00.
  @Cron('30 9 * * 1-5', { name: 'purchase-orders-overdue', timeZone: WORKDAY_TIMEZONE })
  async handleOverduePurchaseOrders() {
    await runScheduledJob('purchase-orders-overdue', this.logger, async () => {
      const enviados = await this.sendOverdueAlerts();
      if (enviados > 0) {
        this.logger.log(`OC atrasadas: ${enviados} resumen(es) enviados`);
      }
    });
  }

  /** Expuesto para pruebas: ejecuta la revisión y devuelve cuántos resúmenes se enviaron. */
  async sendOverdueAlerts(now: Date = new Date()): Promise<number> {
    const rows = await this.prisma.purchaseOrder.findMany({
      where: {
        deletedAt: null,
        status: { in: [...ESTADOS_OC_POR_RECIBIR] },
        // `expectedDate` es `@db.Date`: se compara contra el día de hoy en México, no contra el instante.
        expectedDate: { lt: workDateColumn(now) },
      },
      select: {
        id: true,
        poNumber: true,
        companyId: true,
        status: true,
        expectedDate: true,
        createdById: true,
        approvedById: true,
        supplier: { select: { name: true } },
        createdBy: { select: { nombre: true } },
        approvedBy: { select: { nombre: true } },
        items: { select: { quantity: true, receivedQty: true } },
      },
      orderBy: { expectedDate: 'asc' },
      take: MAX_ORDENES,
    });
    if (!rows.length) return 0;

    const ordenes: OrdenParaAtraso[] = rows.map((r) => ({
      id: r.id,
      poNumber: r.poNumber,
      companyId: r.companyId,
      status: r.status,
      expectedDate: r.expectedDate,
      createdById: r.createdById,
      approvedById: r.approvedById,
      responsableNombre: r.createdById != null ? r.createdBy?.nombre : r.approvedBy?.nombre,
      proveedor: r.supplier?.name ?? null,
      partidas: r.items.map((i) => ({ quantity: Number(i.quantity), receivedQty: Number(i.receivedQty) })),
    }));

    // Jefes de cada comprador. Se calculan una vez por persona aunque tenga muchas órdenes.
    const responsables = new Set<number>();
    for (const o of ordenes) {
      const id = o.createdById ?? o.approvedById;
      if (id != null) responsables.add(id);
    }
    const cadenas = new Map<number, number[]>();
    for (const userId of responsables) {
      try {
        cadenas.set(userId, await this.hierarchy.cadenaDeMando(userId));
      } catch (error) {
        this.logger.warn(
          `OC atrasadas: sin cadena de mando de user=${userId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        cadenas.set(userId, []);
      }
    }

    // Aislamiento por empresa: un jefe sólo recibe lo de las empresas a las que pertenece y está activo.
    // (Christian y los administradores de consola salen de la cadena sin filtrar por empresa.)
    const candidatos = new Set<number>(responsables);
    for (const cadena of cadenas.values()) for (const id of cadena) candidatos.add(id);
    const empresas = [...new Set(ordenes.map((o) => o.companyId))];
    const miembros = new Set<string>();
    if (candidatos.size) {
      const membresias = await this.prisma.userCompany.findMany({
        where: {
          companyId: { in: empresas },
          userId: { in: [...candidatos] },
          user: { isActive: true },
        },
        select: { companyId: true, userId: true },
      });
      for (const m of membresias) miembros.add(claveAvisoOc(m.companyId, m.userId));
    }

    // Idempotencia por día: quien ya recibió hoy su resumen (p. ej. tras reiniciar el servidor) no lo recibe otra vez.
    const yaAvisados = new Set<string>();
    if (candidatos.size) {
      const hoy = await this.prisma.notification.findMany({
        where: {
          userId: { in: [...candidatos] },
          type: 'SLA_ALERT',
          category: CATEGORIA_OC_ATRASADAS,
          createdAt: { gte: workDayStart(now) },
        },
        select: { userId: true, companyId: true },
      });
      for (const n of hoy) {
        if (n.companyId != null) yaAvisados.add(claveAvisoOc(n.companyId, n.userId));
      }
    }

    const plan = planificarAvisosOcAtrasadas({
      ordenes,
      hoy: now,
      jefesDe: (companyId, userId) =>
        (cadenas.get(userId) ?? []).filter((id) => miembros.has(claveAvisoOc(companyId, id))),
      yaAvisados,
    });

    if (plan.sinResponsable.length) {
      this.logger.warn(
        `OC atrasadas sin creador ni aprobador (no hay a quién avisar): ${plan.sinResponsable.join(', ')}`,
      );
    }

    let enviados = 0;
    for (const aviso of plan.avisos) {
      try {
        await this.notifications.createNotification({
          userId: aviso.userId,
          // Reutiliza SLA_ALERT (atraso) para no exigir una migración del enum; la categoría lo distingue.
          type: 'SLA_ALERT',
          category: CATEGORIA_OC_ATRASADAS,
          title: aviso.titulo,
          message: aviso.mensaje,
          icon: 'atraso',
          entityType: 'PurchaseOrder',
          relatedEntityId: aviso.ordenIds.length === 1 ? aviso.ordenIds[0] : undefined,
          relatedUrl: aviso.url,
          priority: aviso.prioridad,
          companyId: aviso.companyId,
          collapseKey: `nx_oc_atrasadas_c${aviso.companyId}_u${aviso.userId}`,
          // La idempotencia del día ya se resolvió arriba; aquí no debe depender de la ventana de 2 min.
          dedupeSeconds: 0,
        });
        enviados += 1;
      } catch (error) {
        this.logger.warn(
          `OC atrasadas: no se avisó a user=${aviso.userId} empresa=${aviso.companyId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return enviados;
  }
}
