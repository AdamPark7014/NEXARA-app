// ...existing code...
import { Injectable, Inject, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';
import { resolveRequiredCompanyId } from './common/tenant/tenant-scope.js';

@Injectable()
export class AppService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // Dashboard: métricas agregadas
  async getDashboardStats() {
    const [
      totalActividades,
      actividadesPorEstatus,
      totalEvidencias,
      evidenciasAprobadas,
      totalViaticos,
      viaticosPorEstatus,
      totalVehículos,
      vehiculosPorEstatus,
      totalUsuarios,
      usuariosActivos,
      totalClientes,
      totalServiceClients,
      totalCotizaciones,
      totalExpenses,
      totalFines,
      totalPurchaseOrders,
      pendingPurchaseOrders,
      totalMaintenanceOrders,
      openMaintenanceOrders,
    ] = await Promise.all([
      this.prisma.activity.count(),
      this.prisma.activity.groupBy({ by: ['estatus'], _count: { _all: true } }),
      this.prisma.evidence.count(),
      this.prisma.evidence.count({ where: { aprobada: true } }),
      this.prisma.expense.count(),
      this.prisma.expense.groupBy({ by: ['estatusPago'], _count: { _all: true } }),
      this.prisma.vehicleControl.count(),
      this.prisma.vehicleControl.groupBy({ by: ['estatusAprobacion'], _count: { _all: true } }),
      this.prisma.user.count(),
      this.prisma.user.count(),
      this.prisma.client.count(),
      this.prisma.serviceClient.count(),
      this.prisma.cotizacion.count(),
      this.prisma.expense.count(),
      this.prisma.fine.count(),
      this.prisma.purchaseOrder.count(),
      this.prisma.purchaseOrder.count({ where: { status: 'DRAFT' } }),
      this.prisma.maintenanceOrder.count(),
      this.prisma.maintenanceOrder.count({ where: { status: { in: ['PLANNED', 'IN_PROGRESS'] } } }),
    ]);
    return {
      actividades: {
        total: totalActividades,
        porEstatus: actividadesPorEstatus.map((e: any) => ({
          estatus: e.estatus,
          cantidad: e._count._all,
        })),
      },
      evidencias: {
        total: totalEvidencias,
        aprobadas: evidenciasAprobadas,
      },
      viaticos: {
        total: totalViaticos,
        porEstatus: viaticosPorEstatus.map((v: any) => ({
          estatus: v.estatusPago,
          cantidad: v._count._all,
        })),
      },
      vehiculos: {
        total: totalVehículos,
        porEstatus: vehiculosPorEstatus.map((v: any) => ({
          estatus: v.estatusAprobacion,
          cantidad: v._count._all,
        })),
      },
      rrhh: {
        totalUsuarios,
        usuariosActivos,
      },
      comercial: {
        totalClientes,
        totalServiceClients,
        totalCotizaciones,
      },
      finanzas: {
        totalExpenses,
        totalFines,
      },
      compras: {
        totalPurchaseOrders,
        pendingPurchaseOrders,
      },
      mantenimiento: {
        totalMaintenanceOrders,
        openMaintenanceOrders,
      },
    };
  }

  async exportAll() {
    const [activities, evidences] = await Promise.all([
      this.prisma['activity'].findMany(),
      this.prisma['evidence'].findMany(),
    ]);
    return { activities, evidences };
  }

  // Importar toda la información relevante
  async importAll(json: any) {
    const { activities, evidences } = json;
    let a = 0;
    let e = 0;
    if (Array.isArray(activities)) {
      for (const dto of activities) {
        try {
          const companyId = dto.companyId ?? (await resolveRequiredCompanyId(this.prisma));
          const exists = await this.prisma['activity'].findUnique({
            where: {
              companyId_anNumber: {
                companyId,
                anNumber: dto.anNumber,
              },
            },
          });
          if (!exists) {
            await this.prisma['activity'].create({
              data: { ...dto, companyId },
            });
            a++;
          }
        } catch (err) {
          // Error silenciado intencionalmente (importAll: actividad)
        }
      }
    }
    if (Array.isArray(evidences)) {
      for (const dto of evidences) {
        try {
          const exists = await this.prisma['evidence'].findFirst({
            where: { archivoUrl: dto.archivoUrl, actividadId: dto.actividadId },
          });
          if (!exists) {
            await this.prisma['evidence'].create({ data: dto });
            e++;
          }
        } catch (err) {
          // Error silenciado intencionalmente (importAll: evidencia)
        }
      }
    }
    return { actividades: a, evidencias: e };
  }
}


