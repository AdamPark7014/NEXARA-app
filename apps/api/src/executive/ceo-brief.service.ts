import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { WorkflowService } from '../workflow/workflow.service.js';
import { ModulePolicyService } from '../common/tenant/module-policy.service.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { ACTIVITY_STATUS, statusVariants } from '../activities/activity-status.js';
import { workDateColumn, workDateKey, workDayStart } from '../common/time/workday.js';
import { ESTADOS_OC_POR_RECIBIR, seleccionarAtrasadas, type OrdenParaAtraso } from '../procurement/purchase-order-overdue.js';
import {
  NOMINA_SETTING_KEY,
  parsearConfigNomina,
  periodoRecienCerrado,
  proximoCorte,
} from '../employee-payments/nomina-calendario.js';
import { ESTATUS_ABIERTOS, FACTURA_CON_SALDO, saldoPendiente } from './executive.service.js';
import { armarResumenCeo, type DatosCeo, type ResumenCeo } from './ceo-brief.js';

/** Cotizaciones que vencen dentro de esta ventana entran al resumen. */
const DIAS_COTIZACION_POR_VENCER = 3;
const DIA_MS = 86_400_000;

export type LectorResumen = { id: number; roleKey?: string | null; isSuperAdmin?: boolean };

/**
 * Junta los datos del resumen «Tu día» del CEO. Cada consulta va acotada a la empresa y una que falle
 * no tumba el resumen: ese renglón simplemente no aparece (mejor un resumen corto que ninguno).
 */
@Injectable()
export class CeoBriefService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
    private readonly policy: ModulePolicyService,
  ) {}

  async resumen(companyId: number | null | undefined, lector: LectorResumen, now: Date = new Date()): Promise<ResumenCeo> {
    const datos = await this.datos(companyId, lector, now);
    return armarResumenCeo(datos, workDateKey(now));
  }

  async datos(companyId: number | null | undefined, lector: LectorResumen, now: Date = new Date()): Promise<DatosCeo> {
    const tenantId = requireCompanyId(companyId);
    const tw = companyWhere(tenantId);
    const hoyColumna = workDateColumn(now);
    const inicioHoy = workDayStart(now);
    const vencenAntes = new Date(inicioHoy.getTime() + (DIAS_COTIZACION_POR_VENCER + 1) * DIA_MS);

    const seguro = async <T>(fallback: T, consulta: () => Promise<T>): Promise<T> => {
      try {
        return await consulta();
      } catch {
        return fallback;
      }
    };

    const [porAprobar, cobranza, comprasAtrasadas, cotizaciones, operacion, nomina] = await Promise.all([
      // Lo que espera su firma, con importe.
      seguro<DatosCeo['porAprobar']>({ cantidad: 0, monto: 0, masAntiguaDias: 0, masGrandes: [] }, async () => {
        const pendientes = await this.workflow.listMyPending(lector.id, tenantId);
        let monto = 0;
        let masAntiguaDias = 0;
        for (const p of pendientes) {
          const r = p.resumen;
          if (r?.monto != null && r.moneda !== 'USD') monto += r.monto;
          const dias = Math.max(0, Math.floor((now.getTime() - new Date(p.createdAt).getTime()) / DIA_MS));
          if (dias > masAntiguaDias) masAntiguaDias = dias;
        }
        const masGrandes = pendientes
          .map((p) => p.resumen)
          .filter((r): r is NonNullable<typeof r> => Boolean(r))
          .sort((a, b) => (b.monto ?? 0) - (a.monto ?? 0))
          .slice(0, 3)
          .map((r) => ({ titulo: r.titulo, monto: r.monto, moneda: r.moneda }));
        return { cantidad: pendientes.length, monto: Math.round(monto * 100) / 100, masAntiguaDias, masGrandes };
      }),

      // Cobranza vencida: por fecha, solo lo que se nos debe.
      seguro<DatosCeo['cobranza']>({ vencidas: 0, monto: 0, diasMasAtrasada: 0 }, async () => {
        const where = {
          ...tw,
          deletedAt: null,
          type: 'ACCOUNTS_RECEIVABLE',
          status: { in: [...FACTURA_CON_SALDO] },
          dueDate: { lt: hoyColumna },
        } as any;
        const [vencidas, suma, masAntigua] = await Promise.all([
          this.prisma.invoice.count({ where }),
          this.prisma.invoice.aggregate({ where, _sum: { totalAmount: true, paidAmount: true } }),
          this.prisma.invoice.findFirst({ where, orderBy: { dueDate: 'asc' }, select: { dueDate: true } }),
        ]);
        const diasMasAtrasada = masAntigua?.dueDate
          ? Math.max(0, Math.round((hoyColumna.getTime() - new Date(masAntigua.dueDate).getTime()) / DIA_MS))
          : 0;
        return { vencidas, monto: saldoPendiente(suma._sum), diasMasAtrasada };
      }),

      // Compras: mismas reglas que el aviso a compradores.
      seguro(0, async () => {
        const filas = await this.prisma.purchaseOrder.findMany({
          where: { ...tw, deletedAt: null, status: { in: [...ESTADOS_OC_POR_RECIBIR] } as any, expectedDate: { lt: hoyColumna } },
          select: {
            id: true,
            poNumber: true,
            companyId: true,
            status: true,
            expectedDate: true,
            createdById: true,
            approvedById: true,
            items: { select: { quantity: true, receivedQty: true } },
          },
          take: 1000,
        });
        const ordenes: OrdenParaAtraso[] = filas.map((f) => ({
          id: f.id,
          poNumber: f.poNumber,
          companyId: f.companyId,
          status: f.status,
          expectedDate: f.expectedDate,
          createdById: f.createdById,
          approvedById: f.approvedById,
          partidas: f.items.map((i) => ({ quantity: Number(i.quantity), receivedQty: Number(i.receivedQty) })),
        }));
        const { atrasadas, sinResponsable } = seleccionarAtrasadas(ordenes, now);
        return atrasadas.length + sinResponsable.length;
      }),

      // Cotizaciones enviadas que vencen pronto.
      seguro<DatosCeo['cotizaciones']>({ porVencer: 0, monto: 0, dias: DIAS_COTIZACION_POR_VENCER }, async () => {
        const r = await this.prisma.cotizacion.aggregate({
          where: { ...tw, deletedAt: null, status: 'SENT', validUntil: { gte: inicioHoy, lt: vencenAntes } } as any,
          _count: { _all: true },
          _sum: { total: true },
        });
        return { porVencer: r._count._all, monto: Number(r._sum.total ?? 0), dias: DIAS_COTIZACION_POR_VENCER };
      }),

      // Operación.
      seguro<DatosCeo['operacion']>({ actividadesAtrasadas: 0, porValidar: 0 }, async () => {
        const [actividadesAtrasadas, porValidar] = await Promise.all([
          this.prisma.activity.count({
            where: { ...tw, estatus: { in: ESTATUS_ABIERTOS }, fechaEntregaEsperada: { lt: now } } as any,
          }),
          this.prisma.activity.count({
            where: { ...tw, estatus: { in: statusVariants(ACTIVITY_STATUS.POR_VALIDAR) } } as any,
          }),
        ]);
        return { actividadesAtrasadas, porValidar };
      }),

      // Nómina: solo si la empresa definió su calendario y quien lee ve «Pagos a personal».
      seguro<DatosCeo['nomina']>(null, async () => {
        if (!(await this.policy.puedeUsar('employee-payments', lector, tenantId))) return null;
        const filas = await this.prisma.systemSetting.findMany({
          where: { key: NOMINA_SETTING_KEY, OR: [{ companyId: null }, { companyId: tenantId }] },
          select: { companyId: true, value: true },
        });
        const propia = filas.find((f) => f.companyId === tenantId) ?? filas.find((f) => f.companyId == null);
        const cfg = parsearConfigNomina(propia?.value);
        if (!cfg) return null;
        const hoy = workDateKey(now);
        const cerrado = periodoRecienCerrado(hoy, cfg);
        const { periodo, dias } = proximoCorte(hoy, cfg);
        return {
          listaParaRevisar: cerrado ? { etiqueta: cerrado.etiqueta, desde: cerrado.desde, hasta: cerrado.hasta } : null,
          proximoCorte: { corte: periodo.corte, dias, etiqueta: periodo.etiqueta },
        };
      }),
    ]);

    return { porAprobar, cobranza, comprasAtrasadas, cotizaciones, operacion, nomina };
  }
}
