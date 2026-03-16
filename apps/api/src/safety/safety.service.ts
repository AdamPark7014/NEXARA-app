import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class SafetyService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Safety Incidents ──────────────────────────────────────────────
  async createIncident(dto: {
    title: string;
    description: string;
    severity: string;
    incidentDate: string;
    location?: string;
  }, userId: number) {
    const count = await this.prisma.safetyIncident.count();
    const incidentNumber = 'INC-' + String(count + 1).padStart(6, '0');
    return this.prisma.safetyIncident.create({
      data: {
        incidentNumber,
        title: dto.title.trim(),
        description: dto.description.trim(),
        severity: dto.severity as any,
        incidentDate: new Date(dto.incidentDate),
        location: dto.location?.trim() || null,
        reportedById: userId,
      },
      include: { reportedBy: { select: { id: true, nombre: true } } },
    });
  }

  async listIncidents(filters?: { status?: string; severity?: string }) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.severity) where.severity = filters.severity;
    return this.prisma.safetyIncident.findMany({
      where,
      include: { reportedBy: { select: { id: true, nombre: true } } },
      orderBy: { incidentDate: 'desc' },
    });
  }

  async getIncident(id: number) {
    const inc = await this.prisma.safetyIncident.findUnique({
      where: { id },
      include: { reportedBy: { select: { id: true, nombre: true } }, assignedTo: { select: { id: true, nombre: true } } },
    });
    if (!inc) throw new NotFoundException('Incidente no encontrado');
    return inc;
  }

  async updateIncident(id: number, dto: any) {
    return this.prisma.safetyIncident.update({ where: { id }, data: dto });
  }

  // ── Work Permits ──────────────────────────────────────────────────
  async createWorkPermit(dto: {
    type: string;
    title: string;
    description?: string;
    location: string;
    validFrom: string;
    validTo: string;
  }, userId: number) {
    const count = await this.prisma.workPermit.count();
    const permitNumber = 'WP-' + String(count + 1).padStart(6, '0');
    return this.prisma.workPermit.create({
      data: {
        permitNumber,
        type: dto.type as any,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        location: dto.location.trim(),
        validFrom: new Date(dto.validFrom),
        validTo: new Date(dto.validTo),
        requestedById: userId,
      },
    });
  }

  async listWorkPermits(filters?: { status?: string; type?: string }) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.type) where.type = filters.type;
    return this.prisma.workPermit.findMany({
      where,
      include: { requestedBy: { select: { id: true, nombre: true } }, approvedBy: { select: { id: true, nombre: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveWorkPermit(id: number, userId: number) {
    return this.prisma.workPermit.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: userId, approvedAt: new Date() },
    });
  }

  // ── Training Records ──────────────────────────────────────────────
  async createTrainingRecord(dto: {
    userId: number;
    courseName: string;
    description?: string;
    completedDate: string;
    expirationDate?: string;
    provider?: string;
    certificateUrl?: string;
    score?: number;
  }) {
    return this.prisma.trainingRecord.create({
      data: {
        userId: dto.userId,
        courseName: dto.courseName.trim(),
        description: dto.description?.trim() || null,
        completedDate: new Date(dto.completedDate),
        expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : null,
        provider: dto.provider?.trim() || null,
        certificateUrl: dto.certificateUrl?.trim() || null,
        score: dto.score ? new Prisma.Decimal(dto.score) : null,
      },
      include: { user: { select: { id: true, nombre: true } } },
    });
  }

  async listTrainingRecords(userId?: number) {
    const where: any = {};
    if (userId) where.userId = userId;
    return this.prisma.trainingRecord.findMany({
      where,
      include: { user: { select: { id: true, nombre: true } } },
      orderBy: { completedDate: 'desc' },
    });
  }

  async getExpiredTrainings() {
    return this.prisma.trainingRecord.findMany({
      where: { expirationDate: { lt: new Date() } },
      include: { user: { select: { id: true, nombre: true } } },
      orderBy: { expirationDate: 'asc' },
    });
  }
}
