import { BadRequestException, Injectable } from '@nestjs/common';
import fs from 'fs/promises';
import path from 'path';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { generateInventoryReportPdf } from './inventory-report-pdf.js';
import {
  assertCompanyAccess,
  companyWhere,
  resolveRequiredCompanyId,
} from '../common/tenant/tenant-scope.js';

type SyncInventoryInput = {
  snapshotId?: number;
  branchId?: number;
  title?: string;
  notes?: string;
  completed?: boolean;
  confirmDifference?: boolean;
  items?: Array<{
    sectionName?: string;
    groupName?: string;
    equipmentName: string;
    serialNumber?: string;
    model?: string;
    panoramicPhotoUrl?: string;
    closeupPhotoUrl?: string;
    stickerPhotoUrl?: string;
    serialBefore?: string;
    serialAfter?: string;
    modelBefore?: string;
    modelAfter?: string;
    beforePanoramicPhotoUrl?: string;
    beforeCloseupPhotoUrl?: string;
    afterPanoramicPhotoUrl?: string;
    afterCloseupPhotoUrl?: string;
    maintenanceStickerPhotoUrl?: string;
    maintenanceActions?: string;
    maintenanceComments?: string;
    itemStatus?: string;
    compareState?: string;
    notes?: string;
    sortOrder?: number;
  }>;
};

@Injectable()
export class InventoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private cloneSnapshotItems(items: any[] = []) {
    return items.map((item, index) => ({
      sectionName: item.sectionName,
      groupName: item.groupName,
      equipmentName: item.equipmentName,
      serialNumber: item.serialNumber,
      model: item.model,
      panoramicPhotoUrl: item.panoramicPhotoUrl,
      closeupPhotoUrl: item.closeupPhotoUrl,
      stickerPhotoUrl: item.stickerPhotoUrl,
      serialBefore: item.serialAfter || item.serialBefore || item.serialNumber,
      serialAfter: item.serialAfter || item.serialBefore || item.serialNumber,
      modelBefore: item.modelAfter || item.modelBefore || item.model,
      modelAfter: item.modelAfter || item.modelBefore || item.model,
      beforePanoramicPhotoUrl:
        item.beforePanoramicPhotoUrl || item.afterPanoramicPhotoUrl || item.panoramicPhotoUrl,
      beforeCloseupPhotoUrl:
        item.beforeCloseupPhotoUrl || item.afterCloseupPhotoUrl || item.closeupPhotoUrl,
      afterPanoramicPhotoUrl:
        item.afterPanoramicPhotoUrl || item.beforePanoramicPhotoUrl || item.panoramicPhotoUrl,
      afterCloseupPhotoUrl:
        item.afterCloseupPhotoUrl || item.beforeCloseupPhotoUrl || item.closeupPhotoUrl,
      maintenanceStickerPhotoUrl: item.maintenanceStickerPhotoUrl || item.stickerPhotoUrl,
      maintenanceActions: item.maintenanceActions,
      maintenanceComments: item.maintenanceComments,
      itemStatus: item.itemStatus,
      compareState: 'UNCHANGED',
      notes: item.notes,
      sortOrder: index,
    }));
  }

  private async assertClientInTenant(clientId: number, companyId: number) {
    const client = await this.prisma.serviceClient.findFirst({
      where: { id: clientId, ...companyWhere(companyId) },
      select: { id: true, companyId: true },
    });
    assertCompanyAccess(client, companyId, 'Cliente');
    return client;
  }

  private async assertActivityInTenant(activityId: number, companyId: number) {
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, ...companyWhere(companyId) },
    });
    assertCompanyAccess(activity, companyId, 'Actividad');
    return activity;
  }

  private async findPreviousSnapshot(
    clientId: number,
    branchId: number,
    companyId: number,
    excludeSnapshotId?: number,
  ) {
    return this.prisma.inventorySnapshot.findFirst({
      where: {
        clientId,
        branchId,
        status: { in: ['COMPLETED', 'APPROVED'] },
        ...companyWhere(companyId),
        ...(excludeSnapshotId ? { id: { not: excludeSnapshotId } } : {}),
      },
      orderBy: [{ approvedAt: 'desc' }, { completedAt: 'desc' }, { updatedAt: 'desc' }],
      include: { items: true },
    });
  }

  private sanitizeItems(rawItems: any[]) {
    return rawItems
      .filter((item) => item && String(item.equipmentName || '').trim())
      .map((item, index) => {
        const serialBefore = item.serialBefore?.trim() || item.serialNumber?.trim() || null;
        const serialAfter = item.serialAfter?.trim() || item.serialNumber?.trim() || null;
        const modelBefore = item.modelBefore?.trim() || item.model?.trim() || null;
        const modelAfter = item.modelAfter?.trim() || item.model?.trim() || null;
        const autoCompareState =
          serialBefore === serialAfter && modelBefore === modelAfter ? 'UNCHANGED' : 'UPDATED';

        return {
          sectionName: item.sectionName?.trim() || null,
          groupName: item.groupName?.trim() || 'GENERAL',
          equipmentName: String(item.equipmentName).trim(),
          serialNumber: serialAfter,
          model: modelAfter,
          panoramicPhotoUrl:
            item.afterPanoramicPhotoUrl?.trim() || item.panoramicPhotoUrl?.trim() || null,
          closeupPhotoUrl:
            item.afterCloseupPhotoUrl?.trim() || item.closeupPhotoUrl?.trim() || null,
          stickerPhotoUrl:
            item.maintenanceStickerPhotoUrl?.trim() || item.stickerPhotoUrl?.trim() || null,
          serialBefore,
          serialAfter,
          modelBefore,
          modelAfter,
          beforePanoramicPhotoUrl:
            item.beforePanoramicPhotoUrl?.trim() || item.panoramicPhotoUrl?.trim() || null,
          beforeCloseupPhotoUrl:
            item.beforeCloseupPhotoUrl?.trim() || item.closeupPhotoUrl?.trim() || null,
          afterPanoramicPhotoUrl:
            item.afterPanoramicPhotoUrl?.trim() || item.panoramicPhotoUrl?.trim() || null,
          afterCloseupPhotoUrl:
            item.afterCloseupPhotoUrl?.trim() || item.closeupPhotoUrl?.trim() || null,
          maintenanceStickerPhotoUrl:
            item.maintenanceStickerPhotoUrl?.trim() || item.stickerPhotoUrl?.trim() || null,
          maintenanceActions: item.maintenanceActions?.trim() || null,
          maintenanceComments: item.maintenanceComments?.trim() || null,
          itemStatus: item.itemStatus?.trim() || 'ACTIVE',
          compareState: item.compareState?.trim() || autoCompareState,
          notes: item.notes?.trim() || item.maintenanceComments?.trim() || null,
          sortOrder: Number.isFinite(item.sortOrder) ? Number(item.sortOrder) : index,
        };
      });
  }

  async list(
    filters?: {
      clientId?: number;
      branchId?: number;
      status?: string;
      createdByType?: 'CLIENT' | 'BRANCH' | 'CONSOLE';
      from?: Date;
      to?: Date;
      search?: string;
    },
    query?: PaginationQueryDto,
    companyId?: number | null,
  ) {
    const cid = await resolveRequiredCompanyId(this.prisma, companyId);
    if (filters?.clientId) {
      await this.assertClientInTenant(filters.clientId, cid);
    }

    const where: Record<string, any> = { ...companyWhere(cid) };
    if (filters?.clientId) where.clientId = filters.clientId;
    if (filters?.branchId) where.branchId = filters.branchId;
    if (filters?.status) where.status = filters.status;
    if (filters?.createdByType) where.createdByType = filters.createdByType;

    if (filters?.from || filters?.to) {
      where.updatedAt = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }

    if (filters?.search?.trim()) {
      const search = filters.search.trim();
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { status: { contains: search, mode: 'insensitive' } },
        { branch: { name: { contains: search, mode: 'insensitive' } } },
        { branch: { branchNumber: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const include = {
      client: true,
      branch: true,
      activity: { select: { id: true, anNumber: true, titulo: true, workType: true, estatus: true } },
      request: { select: { id: true, requestType: true, status: true } },
    };

    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.inventorySnapshot.findMany({ where, include, orderBy: { updatedAt: 'desc' }, skip: query.skip, take: query.take }),
        this.prisma.inventorySnapshot.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }

    return this.prisma.inventorySnapshot.findMany({
      where,
      include,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async detail(id: number, companyId?: number | null) {
    const cid = await resolveRequiredCompanyId(this.prisma, companyId);
    const snapshot = await this.prisma.inventorySnapshot.findFirst({
      where: { id, ...companyWhere(cid) },
      include: {
        client: true,
        branch: true,
        activity: { select: { id: true, anNumber: true, titulo: true, workType: true, estatus: true } },
        request: { select: { id: true, requestType: true, status: true } },
        items: { orderBy: [{ groupName: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] },
      },
    });

    assertCompanyAccess(snapshot, cid, 'Inventario');
    return snapshot;
  }

  async getByActivity(activityId: number, companyId?: number | null) {
    const cid = await resolveRequiredCompanyId(this.prisma, companyId);
    const activity = await this.assertActivityInTenant(activityId, cid);

    let snapshot = await this.prisma.inventorySnapshot.findFirst({
      where: { activityId, ...companyWhere(cid) },
      include: {
        client: true,
        branch: true,
        items: { orderBy: [{ groupName: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] },
      },
    });

    if (!snapshot) {
      const branch = await this.findBranchForActivity(activity);
      const previous = await this.findPreviousSnapshot(activity.clientId as number, branch.id, cid);
      const previousItems = this.cloneSnapshotItems(previous?.items || []);

      snapshot = await this.prisma.inventorySnapshot.create({
        data: {
          clientId: activity.clientId as number,
          branchId: branch.id,
          activityId: activity.id,
          companyId: cid,
          title: `Mantenimiento e inventario ${activity.anNumber || `ACT-${activity.id}`}`,
          status: 'PENDING',
          previousCount: previous?.currentCount ?? previous?.items?.length ?? 0,
          currentCount: previous?.currentCount ?? previous?.items?.length ?? 0,
          deltaCount: 0,
          createdByType: 'CONSOLE',
          createdById: activity.responsableId || activity.creadoPorId,
          items: {
            create: previousItems,
          },
        },
        include: {
          client: true,
          branch: true,
          items: { orderBy: [{ groupName: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] },
        },
      });
    }

    if (snapshot.clientId && snapshot.branchId) {
      const previous = await this.findPreviousSnapshot(
        snapshot.clientId,
        snapshot.branchId,
        cid,
        snapshot.id,
      );
      const previousItems = this.cloneSnapshotItems(previous?.items || []);

      if ((snapshot.items?.length || 0) === 0 && previousItems.length > 0) {
        await this.prisma.inventoryItem.createMany({
          data: previousItems.map((item) => ({ ...item, snapshotId: snapshot!.id })),
        });

        return this.detail(snapshot.id, cid);
      }
    }

    return snapshot;
  }

  async syncByActivity(
    activityId: number,
    payload: SyncInventoryInput,
    userId?: number,
    companyId?: number | null,
  ) {
    const cid = await resolveRequiredCompanyId(this.prisma, companyId);
    const activity = await this.assertActivityInTenant(activityId, cid);
    if (!activity.clientId) throw new BadRequestException('La actividad no está ligada a cliente');

    const branch = await this.findBranchForActivity(activity);
    const current = await this.prisma.inventorySnapshot.findFirst({
      where: { activityId, ...companyWhere(cid) },
      include: { items: true },
    });

    const previous = await this.findPreviousSnapshot(activity.clientId, branch.id, cid, current?.id);

    const rawItems = Array.isArray(payload.items) ? payload.items : current?.items || [];
    const sanitizedItems = this.sanitizeItems(rawItems);

    const previousCount = previous?.currentCount ?? previous?.items?.length ?? 0;
    const currentCount = sanitizedItems.length;
    const deltaCount = currentCount - previousCount;

    if (payload.completed && deltaCount !== 0 && !payload.confirmDifference) {
      const direction = deltaCount > 0 ? 'más' : 'menos';
      throw new BadRequestException(
        `Detectamos diferencia de inventario: ${Math.abs(deltaCount)} equipos ${direction}. Confirma para continuar.`,
      );
    }

    const snapshotData = {
      title: payload.title?.trim() || current?.title || `Inventario ${activity.anNumber || activity.id}`,
      notes: payload.notes?.trim() || null,
      status: payload.completed ? 'COMPLETED' : current?.status || 'PENDING',
      previousCount,
      currentCount,
      deltaCount,
      completedAt: payload.completed ? new Date() : null,
    };

    const upserted = current
      ? await this.prisma.inventorySnapshot.update({
          where: { id: current.id },
          data: snapshotData,
          include: { client: true, branch: true },
        })
      : await this.prisma.inventorySnapshot.create({
          data: {
            clientId: activity.clientId,
            branchId: branch.id,
            activityId: activity.id,
            companyId: cid,
            ...snapshotData,
            status: payload.completed ? 'COMPLETED' : 'PENDING',
            createdByType: 'CONSOLE',
            createdById: userId || activity.responsableId || activity.creadoPorId,
          },
          include: { client: true, branch: true },
        });

    assertCompanyAccess(upserted, cid, 'Inventario');

    await this.prisma.inventoryItem.deleteMany({ where: { snapshotId: upserted.id } });

    if (sanitizedItems.length > 0) {
      await this.prisma.inventoryItem.createMany({
        data: sanitizedItems.map((item) => ({ ...item, snapshotId: upserted.id })),
      });
    }

    return this.detail(upserted.id, cid);
  }

  async syncManualSnapshot(
    context: { clientId: number; branchId: number; createdByType: 'CLIENT' | 'BRANCH' | 'CONSOLE' },
    payload: SyncInventoryInput,
    userId?: number,
    companyId?: number | null,
  ) {
    const cid = await resolveRequiredCompanyId(this.prisma, companyId);
    await this.assertClientInTenant(context.clientId, cid);

    const branch = await this.prisma.serviceClientBranch.findFirst({
      where: { id: context.branchId, clientId: context.clientId },
    });
    if (!branch) throw new BadRequestException('Sucursal no encontrada para inventario');

    const current = payload.snapshotId
      ? await this.prisma.inventorySnapshot.findFirst({
          where: {
            id: Number(payload.snapshotId),
            clientId: context.clientId,
            branchId: context.branchId,
            activityId: null,
            ...companyWhere(cid),
          },
          include: { items: true },
        })
      : await this.prisma.inventorySnapshot.findFirst({
          where: {
            clientId: context.clientId,
            branchId: context.branchId,
            activityId: null,
            status: { in: ['PENDING', 'COMPLETED'] },
            ...companyWhere(cid),
          },
          orderBy: { updatedAt: 'desc' },
          include: { items: true },
        });

    if (current) assertCompanyAccess(current, cid, 'Inventario');

    const previous = await this.findPreviousSnapshot(
      context.clientId,
      context.branchId,
      cid,
      current?.id,
    );

    const rawItems = Array.isArray(payload.items) ? payload.items : current?.items || [];
    const sanitizedItems = this.sanitizeItems(rawItems);

    const previousCount = previous?.currentCount ?? previous?.items?.length ?? 0;
    const currentCount = sanitizedItems.length;
    const deltaCount = currentCount - previousCount;

    if (payload.completed && deltaCount !== 0 && !payload.confirmDifference) {
      const direction = deltaCount > 0 ? 'más' : 'menos';
      throw new BadRequestException(
        `Detectamos diferencia de inventario: ${Math.abs(deltaCount)} equipos ${direction}. Confirma para continuar.`,
      );
    }

    let snapshotId: number;
    if (current) {
      const updated = await this.prisma.inventorySnapshot.update({
        where: { id: current.id },
        data: {
          title: payload.title?.trim() || current.title || `Inventario sucursal ${branch.name}`,
          notes: payload.notes?.trim() || null,
          status: payload.completed ? 'COMPLETED' : current.status || 'PENDING',
          previousCount,
          currentCount,
          deltaCount,
          completedAt: payload.completed ? new Date() : null,
        },
      });
      snapshotId = updated.id;
    } else {
      const created = await this.prisma.inventorySnapshot.create({
        data: {
          clientId: context.clientId,
          branchId: context.branchId,
          companyId: cid,
          title: payload.title?.trim() || `Inventario sucursal ${branch.name}`,
          notes: payload.notes?.trim() || null,
          status: payload.completed ? 'COMPLETED' : 'PENDING',
          previousCount,
          currentCount,
          deltaCount,
          completedAt: payload.completed ? new Date() : null,
          createdByType: context.createdByType,
          createdById: userId,
        },
      });
      snapshotId = created.id;
    }

    await this.prisma.inventoryItem.deleteMany({ where: { snapshotId } });
    if (sanitizedItems.length > 0) {
      await this.prisma.inventoryItem.createMany({
        data: sanitizedItems.map((item) => ({ ...item, snapshotId })),
      });
    }

    return this.detail(snapshotId, cid);
  }

  async updateStatus(id: number, status: string, companyId?: number | null) {
    const cid = await resolveRequiredCompanyId(this.prisma, companyId);
    const existing = await this.prisma.inventorySnapshot.findFirst({
      where: { id, ...companyWhere(cid) },
      select: { id: true, companyId: true },
    });
    assertCompanyAccess(existing, cid, 'Inventario');

    const normalized = String(status || '').toUpperCase();
    if (!['PENDING', 'COMPLETED', 'APPROVED', 'REJECTED'].includes(normalized)) {
      throw new BadRequestException('Estado de inventario inválido');
    }

    return this.prisma.inventorySnapshot.update({
      where: { id },
      data: {
        status: normalized,
        approvedAt: normalized === 'APPROVED' ? new Date() : null,
      },
    });
  }

  async generateReport(snapshotId: number, companyId?: number | null) {
    const cid = await resolveRequiredCompanyId(this.prisma, companyId);
    const snapshot = await this.prisma.inventorySnapshot.findFirst({
      where: { id: snapshotId, ...companyWhere(cid) },
      include: {
        client: true,
        branch: true,
        items: { orderBy: [{ groupName: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] },
      },
    });

    if (!snapshot) return null;
    assertCompanyAccess(snapshot, cid, 'Inventario');

    const pdf = await generateInventoryReportPdf({ snapshot, items: snapshot.items || [] });
    const dir = path.resolve(process.cwd(), 'uploads', 'inventory-reports');
    const filename = `inventory-report-${snapshotId}.pdf`;
    const outPath = path.join(dir, filename);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(outPath, pdf);

    const reportUrl = `/uploads/inventory-reports/${filename}`;
    await this.prisma.inventorySnapshot.update({
      where: { id: snapshotId },
      data: { reportUrl },
    });

    return { pdf, reportUrl };
  }

  private async findBranchForActivity(activity: any) {
    if (!activity.clientId) {
      throw new BadRequestException('Actividad sin cliente para inventario');
    }

    const branch = await this.prisma.serviceClientBranch.findFirst({
      where: {
        clientId: activity.clientId,
        OR: [
          activity.branchNumber ? { branchNumber: activity.branchNumber } : undefined,
          activity.branchName ? { name: activity.branchName } : undefined,
        ].filter(Boolean) as any,
      },
    });

    if (!branch) {
      throw new BadRequestException('No se encontró la sucursal vinculada a la actividad');
    }

    return branch;
  }
}
