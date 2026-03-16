import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';

@Injectable()
export class QualityService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Quality Inspections ───────────────────────────────────────────
  private async generateInspNumber(): Promise<string> {
    const count = await this.prisma.qualityInspection.count();
    return `QI-${String(count + 1).padStart(6, '0')}`;
  }

  async createInspection(dto: {
    type: 'INCOMING' | 'IN_PROCESS' | 'FINAL' | 'RANDOM';
    productId?: number;
    lotId?: number;
    productionOrderId?: number;
    purchaseOrderId?: number;
    inspectedQty: number;
    inspectionDate: string;
    notes?: string;
    checklist: Array<{ parameter: string; specification?: string }>;
  }, userId: number) {
    const inspNumber = await this.generateInspNumber();
    return this.prisma.qualityInspection.create({
      data: {
        inspectionNumber: inspNumber,
        type: dto.type,
        inspectedQty: new Prisma.Decimal(dto.inspectedQty),
        productId: dto.productId ?? null,
        lotId: dto.lotId ?? null,
        productionOrderId: dto.productionOrderId ?? null,
        purchaseOrderId: dto.purchaseOrderId ?? null,
        inspectionDate: new Date(dto.inspectionDate),
        notes: dto.notes?.trim() || null,
        inspectorId: userId,
        checklistItems: {
          create: dto.checklist.map((c, idx) => ({
            sortOrder: idx + 1,
            parameter: c.parameter.trim(),
            specification: c.specification?.trim() || null,
          })),
        },
      },
      include: { checklistItems: true, inspector: { select: { id: true, nombre: true } } },
    });
  }

  async listInspections(filters?: { result?: string; type?: string; productId?: number }, query?: PaginationQueryDto) {
    const where: any = {};
    if (filters?.result) where.result = filters.result;
    if (filters?.type) where.type = filters.type;
    if (filters?.productId) where.productId = filters.productId;
    const include = { checklistItems: true, inspector: { select: { id: true, nombre: true } }, product: true };
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.qualityInspection.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.take }),
        this.prisma.qualityInspection.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma.qualityInspection.findMany({ where, include, orderBy: { createdAt: 'desc' } });
  }

  async getInspection(id: number) {
    const insp = await this.prisma.qualityInspection.findUnique({
      where: { id },
      include: { checklistItems: true, inspector: { select: { id: true, nombre: true } }, product: true, ncrs: true },
    });
    if (!insp) throw new NotFoundException('Inspección no encontrada');
    return insp;
  }

  async recordCheckResult(checkId: number, dto: { actualValue?: string; passed: boolean; notes?: string }) {
    return this.prisma.qualityChecklistItem.update({
      where: { id: checkId },
      data: {
        actualValue: dto.actualValue?.trim() || null,
        passed: dto.passed,
        notes: dto.notes?.trim() || null,
      },
    });
  }

  async completeInspection(id: number, result: 'PASSED' | 'FAILED' | 'CONDITIONAL') {
    return this.prisma.qualityInspection.update({
      where: { id },
      data: { result },
    });
  }

  // ── Non-Conformance Reports ───────────────────────────────────────
  private async generateNCRNumber(): Promise<string> {
    const count = await this.prisma.nonConformanceReport.count();
    return `NCR-${String(count + 1).padStart(6, '0')}`;
  }

  async createNCR(dto: {
    inspectionId?: number;
    productId?: number;
    title: string;
    description: string;
    severity: 'MINOR' | 'MAJOR' | 'CRITICAL';
    rootCause?: string;
    correctiveAction?: string;
    preventiveAction?: string;
  }, userId: number) {
    const ncrNumber = await this.generateNCRNumber();
    return this.prisma.nonConformanceReport.create({
      data: {
        ncrNumber,
        inspectionId: dto.inspectionId ?? null,
        productId: dto.productId ?? null,
        title: dto.title.trim(),
        description: dto.description.trim(),
        severity: dto.severity,
        rootCause: dto.rootCause?.trim() || null,
        correctiveAction: dto.correctiveAction?.trim() || null,
        preventiveAction: dto.preventiveAction?.trim() || null,
        reportedById: userId,
      },
      include: { inspection: true, reportedBy: { select: { id: true, nombre: true } } },
    });
  }

  async listNCRs(filters?: { status?: string; severity?: string }, query?: PaginationQueryDto) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.severity) where.severity = filters.severity;
    const include = { inspection: true, reportedBy: { select: { id: true, nombre: true } }, assignedTo: { select: { id: true, nombre: true } } };
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.nonConformanceReport.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.take }),
        this.prisma.nonConformanceReport.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma.nonConformanceReport.findMany({ where, include, orderBy: { createdAt: 'desc' } });
  }

  async updateNCR(id: number, dto: {
    status?: 'OPEN' | 'INVESTIGATING' | 'CORRECTIVE_ACTION' | 'RESOLVED' | 'CLOSED';
    rootCause?: string;
    correctiveAction?: string;
    preventiveAction?: string;
    assignedToId?: number;
    closedAt?: string;
  }) {
    const data: any = {};
    if (dto.status) data.status = dto.status;
    if (dto.rootCause) data.rootCause = dto.rootCause.trim();
    if (dto.correctiveAction) data.correctiveAction = dto.correctiveAction.trim();
    if (dto.preventiveAction) data.preventiveAction = dto.preventiveAction.trim();
    if (dto.assignedToId) data.assignedToId = dto.assignedToId;
    if (dto.closedAt) data.closedAt = new Date(dto.closedAt);
    return this.prisma.nonConformanceReport.update({ where: { id }, data });
  }

  // ── CAPA Workflow ─────────────────────────────────────────────────
  async assignNCR(id: number, assignedToId: number) {
    return this.prisma.nonConformanceReport.update({
      where: { id },
      data: { assignedToId, status: 'INVESTIGATING' },
    });
  }

  async submitCorrectiveAction(id: number, correctiveAction: string, preventiveAction?: string) {
    return this.prisma.nonConformanceReport.update({
      where: { id },
      data: {
        correctiveAction: correctiveAction.trim(),
        preventiveAction: preventiveAction?.trim() || undefined,
        status: 'CORRECTIVE_ACTION',
      },
    });
  }

  async resolveNCR(id: number) {
    return this.prisma.nonConformanceReport.update({
      where: { id },
      data: { status: 'RESOLVED' },
    });
  }

  async closeNCR(id: number) {
    return this.prisma.nonConformanceReport.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
  }

  // ── Quality Dashboard ─────────────────────────────────────────────
  async getQualityDashboard() {
    const [
      totalInspections,
      passedInspections,
      failedInspections,
      openNCRs,
      criticalNCRs,
      recentNCRs,
    ] = await Promise.all([
      this.prisma.qualityInspection.count(),
      this.prisma.qualityInspection.count({ where: { result: 'PASSED' } }),
      this.prisma.qualityInspection.count({ where: { result: 'FAILED' } }),
      this.prisma.nonConformanceReport.count({ where: { status: { notIn: ['CLOSED', 'RESOLVED'] } } }),
      this.prisma.nonConformanceReport.count({ where: { severity: 'CRITICAL', status: { notIn: ['CLOSED', 'RESOLVED'] } } }),
      this.prisma.nonConformanceReport.findMany({
        where: { status: { notIn: ['CLOSED'] } },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { reportedBy: { select: { id: true, nombre: true } } },
      }),
    ]);

    return {
      totalInspections,
      passedInspections,
      failedInspections,
      passRate: totalInspections > 0 ? Math.round((passedInspections / totalInspections) * 100) : 0,
      openNCRs,
      criticalNCRs,
      recentNCRs,
    };
  }
}
