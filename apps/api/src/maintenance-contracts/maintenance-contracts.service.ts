import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { resolveRequiredCompanyId, companyWhere, assertCompanyAccess } from '../common/tenant/tenant-scope.js';
import { FolioService } from '../common/folio/folio.service.js';
import { assertRefsBelongToCompany } from '../common/tenant/assert-refs.js';

const FREQUENCY_DAYS: Record<string, number> = {
  WEEKLY: 7,
  BIWEEKLY: 14,
  MONTHLY: 30,
  BIMONTHLY: 60,
  QUARTERLY: 90,
  SEMIANNUAL: 180,
  ANNUAL: 365,
};

@Injectable()
export class MaintenanceContractsService {
  private readonly logger = new Logger(MaintenanceContractsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
    private readonly folio: FolioService,
  ) {}

  // ── Contracts ──────────────────────────────────────────────────────
  private generateContractNumber(companyId: number): Promise<string> {
    return this.folio.next('MAINTENANCE_CONTRACT', companyId);
  }

  async createContract(dto: {
    clientId: number;
    branchId?: number | null;
    ownerId?: number | null;
    companyId?: number | null;
    title: string;
    description?: string;
    serviceScope?: string;
    frequency: keyof typeof FREQUENCY_DAYS;
    slaResponseHours?: number;
    slaResolutionHours?: number;
    monthlyFee?: number;
    currency?: string;
    startDate: string;
    endDate?: string | null;
    autoGenerateOt?: boolean;
    notifyHoursBefore?: number;
    notes?: string;
  }) {
    if (!FREQUENCY_DAYS[dto.frequency]) {
      throw new BadRequestException('Frecuencia inválida');
    }
    const start = new Date(dto.startDate);

    const companyId = await resolveRequiredCompanyId(
      this.prisma,
      dto.companyId ??
        (
          await this.prisma.serviceClient.findUnique({
            where: { id: dto.clientId },
            select: { companyId: true },
          })
        )?.companyId,
    );
    // El cliente sólo se usaba para deducir la empresa; la sucursal se escribía
    // sin comprobar de quién era.
    await assertRefsBelongToCompany(companyId, [
      { modelo: this.prisma.serviceClient, ids: [dto.clientId], etiqueta: 'Cliente' },
      { modelo: this.prisma.serviceClientBranch, ids: [dto.branchId], etiqueta: 'Sucursal' },
    ]);

    const contractNumber = await this.generateContractNumber(companyId);
    const contract = await (this.prisma as any).maintenanceContract.create({
      data: {
        contractNumber,
        clientId: dto.clientId,
        branchId: dto.branchId ?? null,
        ownerId: dto.ownerId ?? null,
        companyId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        serviceScope: dto.serviceScope?.trim() || null,
        frequency: dto.frequency,
        slaResponseHours: dto.slaResponseHours ?? 48,
        slaResolutionHours: dto.slaResolutionHours ?? 72,
        monthlyFee: dto.monthlyFee ? new Prisma.Decimal(dto.monthlyFee) : new Prisma.Decimal(0),
        currency: dto.currency || 'MXN',
        startDate: start,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        nextVisitDate: start,
        autoGenerateOt: dto.autoGenerateOt !== false,
        notifyHoursBefore: dto.notifyHoursBefore ?? 24,
        notes: dto.notes?.trim() || null,
      },
      include: { client: true, branch: true, owner: { select: { id: true, nombre: true } } },
    });

    await this.scheduleNextVisit(contract.id, start);
    return contract;
  }

  async listContracts(filters?: {
    status?: string;
    clientId?: number;
    ownerId?: number;
    companyId?: number | null;
  }) {
    const where: any = { deletedAt: null, ...companyWhere(filters?.companyId ?? null) };
    if (filters?.status) where.status = filters.status;
    if (filters?.clientId) where.clientId = filters.clientId;
    if (filters?.ownerId) where.ownerId = filters.ownerId;
    return (this.prisma as any).maintenanceContract.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, branchNumber: true } },
        owner: { select: { id: true, nombre: true } },
        _count: { select: { visits: true } },
      },
      orderBy: { nextVisitDate: 'asc' },
    });
  }

  async getContract(id: number, companyId?: number | null) {
    const contract = await (this.prisma as any).maintenanceContract.findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
      include: {
        client: true,
        branch: true,
        owner: { select: { id: true, nombre: true, email: true } },
        visits: {
          orderBy: { scheduledDate: 'desc' },
          take: 20,
          include: { assignedTo: { select: { id: true, nombre: true } } },
        },
      },
    });
    assertCompanyAccess(contract, companyId, 'Contrato');
    return contract;
  }

  async updateContract(id: number, dto: any, companyId?: number | null) {
    const existing = await (this.prisma as any).maintenanceContract.findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
    });
    assertCompanyAccess(existing, companyId, 'Contrato');

    const data: any = { ...dto };
    delete data.companyId;
    delete data.id;
    if (dto.startDate) data.startDate = new Date(dto.startDate);
    if (dto.endDate) data.endDate = new Date(dto.endDate);
    if (dto.monthlyFee !== undefined) data.monthlyFee = new Prisma.Decimal(dto.monthlyFee);
    return (this.prisma as any).maintenanceContract.update({ where: { id }, data });
  }

  async setStatus(
    id: number,
    status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'CANCELLED',
    companyId?: number | null,
  ) {
    const existing = await (this.prisma as any).maintenanceContract.findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
    });
    assertCompanyAccess(existing, companyId, 'Contrato');
    return (this.prisma as any).maintenanceContract.update({ where: { id }, data: { status } });
  }

  // ── Visits & SLA scheduling ───────────────────────────────────────
  private addDays(base: Date, days: number): Date {
    const next = new Date(base);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  async scheduleNextVisit(contractId: number, fromDate?: Date) {
    const contract = await (this.prisma as any).maintenanceContract.findUnique({ where: { id: contractId } });
    if (!contract) return;
    const days = FREQUENCY_DAYS[contract.frequency as keyof typeof FREQUENCY_DAYS] || 30;
    const base = fromDate || contract.nextVisitDate || contract.startDate;
    const nextDate = this.addDays(new Date(base), days);

    await (this.prisma as any).maintenanceContract.update({
      where: { id: contractId },
      data: { nextVisitDate: nextDate },
    });

    await (this.prisma as any).maintenanceContractVisit.upsert({
      where: { contractId_scheduledDate: { contractId, scheduledDate: nextDate } },
      update: {},
      create: {
        contractId,
        scheduledDate: nextDate,
        status: 'SCHEDULED',
        companyId: contract.companyId,
      },
    });
  }

  async listVisits(filters?: {
    contractId?: number;
    status?: string;
    from?: string;
    to?: string;
    companyId?: number | null;
  }) {
    const where: any = { ...companyWhere(filters?.companyId ?? null) };
    if (filters?.contractId) where.contractId = filters.contractId;
    if (filters?.status) where.status = filters.status;
    if (filters?.from || filters?.to) {
      where.scheduledDate = {};
      if (filters.from) where.scheduledDate.gte = new Date(filters.from);
      if (filters.to) where.scheduledDate.lte = new Date(filters.to);
    }
    return (this.prisma as any).maintenanceContractVisit.findMany({
      where,
      include: {
        contract: {
          select: {
            id: true,
            contractNumber: true,
            title: true,
            slaResponseHours: true,
            client: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
          },
        },
        assignedTo: { select: { id: true, nombre: true } },
      },
      orderBy: { scheduledDate: 'asc' },
    });
  }

  // ── OT auto-generation ────────────────────────────────────────────
  /**
   * Genera Actividad (OT operativa) para una visita programada y la enlaza al contrato.
   * Crea OperationalProject si el contrato no tiene uno y respeta el SLA del contrato.
   */
  async materializeVisitAsActivity(
    visitId: number,
    options?: { assignedToId?: number },
    companyId?: number | null,
  ) {
    const visit = await (this.prisma as any).maintenanceContractVisit.findFirst({
      where: { id: visitId, ...companyWhere(companyId ?? null) },
      include: {
        contract: {
          include: {
            client: true,
            branch: true,
            owner: true,
          },
        },
      },
    });
    if (!visit) throw new NotFoundException('Visita no encontrada');
    assertCompanyAccess(visit, companyId, 'Visita');
    if (visit.activityId) {
      return { alreadyExists: true, activityId: visit.activityId };
    }

    const contract = visit.contract;
    if (contract.status !== 'ACTIVE') {
      throw new BadRequestException('El contrato no está activo');
    }

    let operationalProjectId = visit.operationalProjectId || contract.operationalProjectId;
    const tenantId = await resolveRequiredCompanyId(
      this.prisma,
      companyId ?? visit.companyId ?? contract.companyId,
    );
    if (!operationalProjectId) {
      // Proyecto OPS dedicado al contrato — NUNCA reutilizar un proyecto comercial del cliente.
      const vendorId = contract.ownerId || 1;
      const created = await this.prisma.operationalProject.create({
        data: {
          title: `Mantenimiento ${contract.contractNumber} — ${contract.client?.name || contract.title}`,
          description: contract.description || contract.serviceScope || null,
          projectType: 'MANTENIMIENTO' as any,
          scopeSummary: contract.serviceScope || null,
          clientId: contract.clientId,
          vendorId,
          startDate: contract.startDate,
          endDate: contract.endDate || null,
          status: 'ACTIVE' as any,
          companyId: tenantId,
        },
      });
      operationalProjectId = created.id;
      await (this.prisma as any).maintenanceContract.update({
        where: { id: contract.id },
        data: { operationalProjectId },
      });
    }

    const responsibleId = options?.assignedToId || visit.assignedToId || contract.ownerId || 1;
    const slaMin = contract.slaResolutionHours * 60;
    const fechaAsignacion = new Date();
    const fechaMaxima = new Date(fechaAsignacion);
    fechaMaxima.setHours(fechaMaxima.getHours() + contract.slaResolutionHours);

    const anNumber = await this.generateNextAnNumber(tenantId);
    const activity = await this.prisma.activity.create({
      data: {
        anNumber,
        titulo: `[${contract.contractNumber}] ${contract.title}`,
        descripcion: contract.description || `Visita programada de mantenimiento preventivo (${contract.frequency}).`,
        indicaciones: contract.serviceScope || null,
        activityType: 'CLIENT' as any,
        ticketType: 'PREVENTIVO' as any,
        workType: 'PREVENTIVE_INVENTORY',
        projectId: operationalProjectId,
        clientId: contract.clientId,
        branchName: contract.branch?.name || null,
        branchNumber: contract.branch?.branchNumber || null,
        branchCity: contract.branch?.city || null,
        branchState: contract.branch?.state || null,
        branchAddress: contract.branch?.address || null,
        tiempoMaximoMin: slaMin,
        creadoPorId: contract.ownerId || 1,
        responsableId: responsibleId,
        fechaAsignacion,
        fechaMaxima,
        companyId: tenantId,
      },
    });

    await (this.prisma as any).maintenanceContractVisit.update({
      where: { id: visit.id },
      data: {
        status: 'GENERATED',
        generatedAt: new Date(),
        operationalProjectId,
        activityId: activity.id,
        assignedToId: responsibleId,
      },
    });

    try {
      await this.notificationHierarchy.notifyActivityAssigned(
        responsibleId,
        activity.id,
        activity.titulo,
        `Contrato ${contract.contractNumber}`,
      );
    } catch (err) {
      this.logger.warn(`No se pudo notificar OT ${activity.anNumber}: ${(err as Error).message}`);
    }

    return { alreadyExists: false, activityId: activity.id, anNumber, operationalProjectId };
  }

  async markVisitCompleted(visitId: number, companyId?: number | null) {
    const visit = await (this.prisma as any).maintenanceContractVisit.findFirst({
      where: { id: visitId, ...companyWhere(companyId ?? null) },
      include: { contract: { select: { id: true, companyId: true } } },
    });
    if (!visit) throw new NotFoundException('Visita no encontrada');
    assertCompanyAccess(visit, companyId, 'Visita');
    if (!visit.activityId) {
      await this.materializeVisitAsActivity(visitId, undefined, companyId ?? visit.companyId);
    }

    const updated = await (this.prisma as any).maintenanceContractVisit.update({
      where: { id: visitId },
      data: { status: 'COMPLETED', completedAt: new Date() },
      include: { contract: true },
    });
    if (updated?.contract) {
      await this.scheduleNextVisit(updated.contract.id, new Date());
    }
    return updated;
  }

  // ── Cron worker (called by CronService) ────────────────────────────
  async runAutoGenerationCycle() {
    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + 1);

    const visits = await (this.prisma as any).maintenanceContractVisit.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledDate: { lte: horizon },
        contract: { status: 'ACTIVE', autoGenerateOt: true, deletedAt: null },
      },
      include: { contract: true },
      take: 100,
    });

    let generated = 0;
    for (const visit of visits) {
      try {
        await this.materializeVisitAsActivity(visit.id, undefined, visit.companyId);
        generated += 1;
      } catch (err) {
        this.logger.error(`No se generó OT para visita ${visit.id}: ${(err as Error).message}`);
      }
    }
    return { processed: visits.length, generated };
  }

  // ── Helpers ────────────────────────────────────────────────────────
  private async generateNextAnNumber(companyId: number): Promise<string> {
    const [latest] = await this.prisma.$queryRaw<Array<{ anNumber: string }>>`
      SELECT "anNumber" FROM "Activity"
      WHERE "companyId" = ${companyId}
        AND "anNumber" ~ '\\d+$'
      ORDER BY CAST(substring("anNumber" FROM '(\\d+)$') AS INTEGER) DESC
      LIMIT 1
    `;
    if (!latest?.anNumber) return 'AN-0001';
    const match = latest.anNumber.match(/^(.*?)(\d+)$/);
    if (!match) return 'AN-0001';
    const prefix = match[1] || 'AN-';
    const num = Number(match[2]) + 1;
    const pad = match[2].length || 4;
    return `${prefix}${String(num).padStart(pad, '0')}`;
  }
}
