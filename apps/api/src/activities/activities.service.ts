import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateActivityDto } from './dto/create-activity.dto.js';
import { UpdateActivityDto } from './dto/update-activity.dto.js';
import { generateTicketReportPdf } from './ticket-report-pdf.js';
import fs from 'fs/promises';
import path from 'path';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  // Dummy implementation to avoid controller errors
  toCSV(_data: any[]): string {
    return '';
  }

  importMany(_json: any[]): void {
    throw new Error('importMany no implementado en ActivitiesService');
  }


  private async generateNextAnNumber(): Promise<string> {
    const activities = await this.prisma['activity'].findMany({
      select: { anNumber: true },
    });

    let maxNumber = 0;
    let prefix = 'AN-';
    let padLength = 4;

    for (const activity of activities) {
      if (!activity.anNumber) continue;
      const match = activity.anNumber.match(/^(.*?)(\d+)$/);
      if (!match) continue;
      const numeric = Number(match[2]);
      if (Number.isNaN(numeric)) continue;
      if (numeric >= maxNumber) {
        maxNumber = numeric;
        prefix = match[1] || 'AN-';
        padLength = match[2].length || padLength;
      }
    }

    const next = maxNumber + 1;
    return `${prefix}${String(next).padStart(padLength, '0')}`;
  }

  async getNextAnNumber(): Promise<string> {
    return this.generateNextAnNumber();
  }

  async create(createActivityDto: CreateActivityDto) {
    const trimmed = createActivityDto.anNumber?.trim();
    const anNumber = trimmed ? trimmed : await this.generateNextAnNumber();
    return this.prisma['activity'].create({
      data: { ...createActivityDto, anNumber },
    });
  }

  async findAll() {
    return this.prisma['activity'].findMany({
      include: { creador: true, responsable: true, client: true, serviceSheet: true, activityEvidence: true },
    });
  }

  async findAllDetailed() {
    return this.prisma['activity'].findMany({
      include: {
        creador: true,
        responsable: true,
        client: true,
        serviceSheet: true,
        evidencias: true,
        clientFeedback: true,
        activityEvidence: true,
      },
      orderBy: { fechaAsignacion: 'desc' },
    });
  }

  async findByDepartment(departmentId: number) {
    // Busca actividades donde el responsable es de ese departamento
    return this.prisma['activity'].findMany({
      where: { responsable: { departmentId } },
      include: { creador: true, responsable: true, client: true, serviceSheet: true, activityEvidence: true },
    });
  }

  async findByResponsible(userId: number) {
    return this.prisma['activity'].findMany({
      where: { responsableId: userId },
      include: { creador: true, responsable: true, client: true, serviceSheet: true, activityEvidence: true },
    });
  }

  async findOne(id: number) {
    return this.prisma['activity'].findUnique({
      where: { id },
      include: { creador: true, responsable: true, client: true, serviceSheet: true, activityEvidence: true },
    });
  }

  async generateTicketReport(activityId: number) {
    const activity = await this.prisma['activity'].findUnique({
      where: { id: activityId },
      include: { client: true, responsable: true, serviceSheet: true, evidencias: true },
    });
    if (!activity) return null;

    const pdf = await generateTicketReportPdf({
      anNumber: activity.anNumber,
      titulo: activity.titulo,
      estatus: activity.estatus,
      clientName: activity.client?.name,
      clientLogoUrl: activity.client?.logoUrl,
      branchName: activity.branchName,
      branchNumber: activity.branchNumber,
      branchCity: activity.branchCity,
      branchState: activity.branchState,
      branchAddress: activity.branchAddress,
      ticketType: activity.ticketType,
      prioridad: activity.prioridad,
      dueAt: activity.fechaEntregaEsperada,
      startedAt: activity.fechaInicio,
      finishedAt: activity.fechaFinalizacion,
      responsableName: activity.responsable?.nombre || null,
      managerName: activity.serviceSheet?.managerName || null,
      workSummary: activity.serviceSheet?.workSummary || null,
      observations: activity.serviceSheet?.observations || null,
      evidences: (activity.evidencias || []).map((evidence) => ({
        archivoUrl: evidence.archivoUrl,
        tipoEvidencia: evidence.tipoEvidencia,
        latitud: evidence.latitud === null || evidence.latitud === undefined ? null : Number(evidence.latitud),
        longitud: evidence.longitud === null || evidence.longitud === undefined ? null : Number(evidence.longitud),
      })),
    });

    const dir = path.resolve(process.cwd(), 'uploads', 'ticket-reports');
    const filename = `reporte-ticket-${activityId}.pdf`;
    const outPath = path.join(dir, filename);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(outPath, pdf);

    const reportUrl = `/uploads/ticket-reports/${filename}`;
    await this.prisma['activity'].update({
      where: { id: activityId },
      data: { ticketReportUrl: reportUrl, ticketReportGeneratedAt: new Date() },
    });

    return { pdf, reportUrl };
  }

  async update(id: number, updateActivityDto: UpdateActivityDto) {
    return this.prisma['activity'].update({
      where: { id },
      data: updateActivityDto,
    });
  }

  async remove(id: number) {
    return this.prisma['activity'].delete({ where: { id } });
  }
}
