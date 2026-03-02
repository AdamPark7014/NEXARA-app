import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import fs from 'fs/promises';
import path from 'path';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateInventoryReportPdf } from './inventory-report-pdf.js';

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

  async list(filters?: { clientId?: number; branchId?: number; status?: string }) {
    const where: Record<string, any> = {};
    if (filters?.clientId) where.clientId = filters.clientId;
    if (filters?.branchId) where.branchId = filters.branchId;
    if (filters?.status) where.status = filters.status;

    return this.prisma.inventorySnapshot.findMany({
      where,
      include: {
        client: true,
        branch: true,
        activity: { select: { id: true, anNumber: true, titulo: true, workType: true, estatus: true } },
        request: { select: { id: true, requestType: true, status: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async detail(id: number) {
    const snapshot = await this.prisma.inventorySnapshot.findUnique({
      where: { id },
      include: {
        client: true,
        branch: true,
        activity: { select: { id: true, anNumber: true, titulo: true, workType: true, estatus: true } },
        request: { select: { id: true, requestType: true, status: true } },
        items: { orderBy: [{ groupName: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] },
      },
    });

    if (!snapshot) throw new NotFoundException('Inventario no encontrado');
    return snapshot;
  }

  async getByActivity(activityId: number) {
    const activity = await this.prisma.activity.findUnique({ where: { id: activityId } });
    if (!activity) throw new NotFoundException('Actividad no encontrada');

    let snapshot = await this.prisma.inventorySnapshot.findUnique({
      where: { activityId },
      include: {
        client: true,
        branch: true,
        items: { orderBy: [{ groupName: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] },
      },
    });

    if (!snapshot) {
      const branch = await this.findBranchForActivity(activity);
      const previous = await this.prisma.inventorySnapshot.findFirst({
        where: { clientId: activity.clientId || undefined, branchId: branch.id },
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      });

      snapshot = await this.prisma.inventorySnapshot.create({
        data: {
          clientId: activity.clientId as number,
          branchId: branch.id,
          activityId: activity.id,
          title: `Mantenimiento e inventario ${activity.anNumber || `ACT-${activity.id}`}`,
          status: 'PENDING',
          previousCount: previous?.currentCount ?? previous?.items?.length ?? 0,
          currentCount: previous?.currentCount ?? previous?.items?.length ?? 0,
          deltaCount: 0,
          createdByType: 'CONSOLE',
          createdById: activity.responsableId || activity.creadoPorId,
          items: {
            create:
              previous?.items?.map((item, index) => ({
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
                maintenanceStickerPhotoUrl:
                  item.maintenanceStickerPhotoUrl || item.stickerPhotoUrl,
                maintenanceActions: item.maintenanceActions,
                maintenanceComments: item.maintenanceComments,
                itemStatus: item.itemStatus,
                compareState: 'UNCHANGED',
                notes: item.notes,
                sortOrder: index,
              })) || [],
          },
        },
        include: {
          client: true,
          branch: true,
          items: { orderBy: [{ groupName: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] },
        },
      });
    }

    return snapshot;
  }

  async syncByActivity(activityId: number, payload: SyncInventoryInput, userId?: number) {
    const activity = await this.prisma.activity.findUnique({ where: { id: activityId } });
    if (!activity) throw new NotFoundException('Actividad no encontrada');
    if (!activity.clientId) throw new BadRequestException('La actividad no está ligada a cliente');

    const branch = await this.findBranchForActivity(activity);
    const current = await this.prisma.inventorySnapshot.findUnique({
      where: { activityId },
      include: { items: true },
    });

    const previous = await this.prisma.inventorySnapshot.findFirst({
      where: {
        clientId: activity.clientId,
        branchId: branch.id,
        ...(current ? { id: { not: current.id } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });

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

    const upserted = await this.prisma.inventorySnapshot.upsert({
      where: { activityId },
      update: {
        title: payload.title?.trim() || current?.title || `Inventario ${activity.anNumber || activity.id}`,
        notes: payload.notes?.trim() || null,
        status: payload.completed ? 'COMPLETED' : current?.status || 'PENDING',
        previousCount,
        currentCount,
        deltaCount,
        completedAt: payload.completed ? new Date() : null,
      },
      create: {
        clientId: activity.clientId,
        branchId: branch.id,
        activityId: activity.id,
        title: payload.title?.trim() || `Inventario ${activity.anNumber || activity.id}`,
        notes: payload.notes?.trim() || null,
        status: payload.completed ? 'COMPLETED' : 'PENDING',
        previousCount,
        currentCount,
        deltaCount,
        completedAt: payload.completed ? new Date() : null,
        createdByType: 'CONSOLE',
        createdById: userId || activity.responsableId || activity.creadoPorId,
      },
      include: {
        client: true,
        branch: true,
      },
    });

    await this.prisma.inventoryItem.deleteMany({ where: { snapshotId: upserted.id } });

    if (sanitizedItems.length > 0) {
      await this.prisma.inventoryItem.createMany({
        data: sanitizedItems.map((item) => ({ ...item, snapshotId: upserted.id })),
      });
    }

    return this.detail(upserted.id);
  }

  async syncManualSnapshot(
    context: { clientId: number; branchId: number; createdByType: 'CLIENT' | 'BRANCH' | 'CONSOLE' },
    payload: SyncInventoryInput,
    userId?: number,
  ) {
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
          },
          include: { items: true },
        })
      : await this.prisma.inventorySnapshot.findFirst({
          where: {
            clientId: context.clientId,
            branchId: context.branchId,
            activityId: null,
            status: { in: ['PENDING', 'COMPLETED'] },
          },
          orderBy: { updatedAt: 'desc' },
          include: { items: true },
        });

    const previous = await this.prisma.inventorySnapshot.findFirst({
      where: {
        clientId: context.clientId,
        branchId: context.branchId,
        activityId: null,
        ...(current ? { id: { not: current.id } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });

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

    return this.detail(snapshotId);
  }

  async updateStatus(id: number, status: string) {
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

  async generateReport(snapshotId: number) {
    const snapshot = await this.prisma.inventorySnapshot.findUnique({
      where: { id: snapshotId },
      include: {
        client: true,
        branch: true,
        items: { orderBy: [{ groupName: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] },
      },
    });

    if (!snapshot) return null;

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
