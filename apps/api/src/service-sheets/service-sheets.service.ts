import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ServiceClientsService } from '../service-clients/service-clients.service.js';
import { UpsertServiceSheetDto } from './dto/upsert-service-sheet.dto.js';
import { generateServiceSheetPdf } from './service-sheet-pdf.js';
import fs from 'fs/promises';
import path from 'path';
import { PERMISSIONS } from '../common/permissions.js';

@Injectable()
export class ServiceSheetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serviceClientsService: ServiceClientsService,
  ) {}

  async upsert(activityId: number, dto: UpsertServiceSheetDto) {
    const activity = await this.prisma['activity'].findUnique({
      where: { id: activityId },
    });
    if (!activity) throw new NotFoundException('Actividad no encontrada');

    const sheet = await this.prisma['serviceSheet'].upsert({
      where: { activityId },
      update: {
        managerName: dto.managerName?.trim(),
        managerRole: dto.managerRole?.trim(),
        workSummary: dto.workSummary,
        equipmentList: this.normalizeJsonInput(dto.equipmentList),
        observations: dto.observations,
        signedName: dto.signedName?.trim(),
        survey: this.normalizeJsonInput(dto.survey),
      },
      create: {
        activityId,
        managerName: dto.managerName?.trim() || null,
        managerRole: dto.managerRole?.trim() || null,
        workSummary: dto.workSummary || null,
        equipmentList: this.normalizeJsonInput(dto.equipmentList) ?? Prisma.JsonNull,
        observations: dto.observations || null,
        signedName: dto.signedName?.trim() || null,
        survey: this.normalizeJsonInput(dto.survey) ?? Prisma.JsonNull,
      },
    });

    await this.tryFinalizeActivity(activityId);
    return sheet;
  }

  async findAll(user: any) {
    const isSuperAdmin = Boolean(user?.isSuperAdmin);
    const isConsoleAdmin = Boolean(user?.permissions?.includes?.(PERMISSIONS.CONSOLE_ADMIN));
    const departmentId = user?.departmentId;
    const userId = user?.id;

    const isOpsManager = isConsoleAdmin || Boolean(user?.permissions?.includes?.(PERMISSIONS.ACTIVITIES_MANAGE));

    let where: Prisma.ServiceSheetWhereInput | undefined;
    if (isSuperAdmin) {
      where = undefined;
    } else if (isOpsManager && departmentId) {
      where = {
        activity: {
          responsable: {
            departmentId,
          },
        },
      };
    } else if (userId) {
      where = {
        activity: {
          responsableId: userId,
        },
      };
    } else {
      where = { id: -1 };
    }

    const sheets = await this.prisma['serviceSheet'].findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        activity: {
          include: {
            client: true,
            responsable: true,
          },
        },
      },
    });

    return sheets.map((sheet) => ({
      ...sheet,
      clientName: sheet.activity?.client?.name || null,
      technicianName: sheet.activity?.responsable?.nombre || null,
      serviceType: sheet.activity?.ticketType || null,
      status: sheet.activity?.estatus || null,
    }));
  }

  async findByActivity(activityId: number) {
    const sheet = await this.prisma['serviceSheet'].findUnique({ where: { activityId } });
    if (!sheet) throw new NotFoundException('Hoja de servicio no encontrada');
    return sheet;
  }

  async getPdf(activityId: number) {
    const activity = await this.prisma['activity'].findUnique({
      where: { id: activityId },
      include: { client: true, serviceSheet: true },
    });
    if (!activity || !activity.serviceSheet) {
      throw new NotFoundException('Hoja de servicio no encontrada');
    }

    if (activity.serviceSheet.pdfUrl) {
      const existingPath = path.resolve(process.cwd(), activity.serviceSheet.pdfUrl.replace(/^\//, ''));
      try {
        const existingPdf = await fs.readFile(existingPath);
        return existingPdf;
      } catch {
        // If file is missing/corrupt, regenerate below.
      }
    }

    const equipmentList = Array.isArray(activity.serviceSheet.equipmentList)
      ? (activity.serviceSheet.equipmentList as any[])
      : [];

    const pdf = await generateServiceSheetPdf({
      anNumber: activity.anNumber,
      clientName: activity.client?.name,
      clientLogoUrl: activity.client?.logoUrl,
      branchName: activity.branchName,
      branchNumber: activity.branchNumber,
      branchCity: activity.branchCity,
      branchState: activity.branchState,
      branchAddress: activity.branchAddress,
      ticketType: activity.ticketType,
      startedAt: activity.fechaInicio,
      finishedAt: activity.fechaFinalizacion,
      managerName: activity.serviceSheet.managerName,
      managerRole: activity.serviceSheet.managerRole,
      workSummary: activity.serviceSheet.workSummary,
      equipmentList: equipmentList as any,
      observations: activity.serviceSheet.observations,
      signedName: activity.serviceSheet.signedName,
      survey: (activity.serviceSheet.survey as any) || null,
    });

    const dir = path.resolve(process.cwd(), 'uploads', 'service-sheets');
    const filename = `hoja-servicio-${activityId}.pdf`;
    const outPath = path.join(dir, filename);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(outPath, pdf);

    const pdfUrl = `/uploads/service-sheets/${filename}`;
    await this.prisma['serviceSheet'].update({
      where: { activityId },
      data: { pdfUrl },
    });

    return pdf;
  }

  async tryFinalizeActivity(activityId: number) {
    const activity = await this.prisma['activity'].findUnique({
      where: { id: activityId },
      include: { serviceSheet: true },
    });
    if (!activity || !activity.serviceSheet) return;

    if (!this.isServiceSheetComplete(activity.serviceSheet)) return;

    const requiredTypes = [
      'Foto llegada',
      'Foto salida',
      'Evidencia general',
      'Hoja de Servicio',
    ];

    const evidences = await this.prisma['evidence'].findMany({
      where: { actividadId: activityId },
      select: { tipoEvidencia: true },
    });

    const present = new Set(evidences.map((e) => e.tipoEvidencia));
    const hasAll = requiredTypes.every((type) => present.has(type));
    if (!hasAll) return;

    if (activity.estatus !== 'Finalizada') {
      await this.prisma['activity'].update({
        where: { id: activityId },
        data: {
          estatus: 'Finalizada',
          fechaFinalizacion: new Date(),
        },
      });
    }

    if (!activity.serviceSheet.pdfUrl) {
      await this.getPdf(activityId);
    }

    await this.serviceClientsService.requestClientSurvey(activityId);
  }

  private isServiceSheetComplete(sheet: {
    managerName?: string | null;
    managerRole?: string | null;
    workSummary?: string | null;
    equipmentList?: unknown;
    observations?: string | null;
    signedName?: string | null;
    survey?: unknown;
  }) {
    const hasText = (value?: string | null) => Boolean(value && value.trim().length > 0);

    if (!hasText(sheet.managerName)) return false;
    if (!hasText(sheet.managerRole)) return false;
    if (!hasText(sheet.workSummary)) return false;
    if (!hasText(sheet.observations)) return false;
    if (!hasText(sheet.signedName)) return false;

    const equipment = Array.isArray(sheet.equipmentList) ? sheet.equipmentList : [];
    if (equipment.length === 0) return false;
    const allEquipmentOk = equipment.every((item: any) =>
      hasText(item?.name) && hasText(item?.model) && hasText(item?.serial) && hasText(item?.action),
    );
    if (!allEquipmentOk) return false;

    const survey = sheet.survey as
      | { engineerIdentified?: boolean | null; friendlyAttention?: boolean | null; solutionSatisfied?: boolean | null }
      | null
      | undefined;
    if (!survey) return false;
    if (survey.engineerIdentified === null || survey.engineerIdentified === undefined) return false;
    if (survey.friendlyAttention === null || survey.friendlyAttention === undefined) return false;
    if (survey.solutionSatisfied === null || survey.solutionSatisfied === undefined) return false;

    return true;
  }

  private normalizeJsonInput(value: unknown) {
    if (value === undefined) return undefined;
    if (value === null) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
  }
}
