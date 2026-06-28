import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Document Categories ───────────────────────────────────────────
  async createCategory(dto: { name: string; description?: string; parentId?: number }) {
    return this.prisma.documentCategory.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        parentId: dto.parentId ?? null,
      },
    });
  }

  async listCategories() {
    return this.prisma.documentCategory.findMany({
      include: { children: true, _count: { select: { documents: true } } },
      where: { parentId: null },
      orderBy: { name: 'asc' },
    });
  }

  // ── Managed Documents ─────────────────────────────────────────────
  async createDocument(dto: {
    title: string;
    documentNumber?: string;
    categoryId?: number;
    description?: string;
    fileUrl?: string;
    mimeType?: string;
    fileSizeBytes?: number;
    retentionDays?: number;
  }, userId: number) {
    const count = await this.prisma.managedDocument.count();
    const docNumber = dto.documentNumber?.trim() || 'DOC-' + String(count + 1).padStart(6, '0');
    return this.prisma.managedDocument.create({
      data: {
        documentNumber: docNumber,
        title: dto.title.trim(),
        categoryId: dto.categoryId ?? null,
        description: dto.description?.trim() || null,
        fileUrl: dto.fileUrl?.trim() || null,
        mimeType: dto.mimeType?.trim() || null,
        fileSizeBytes: dto.fileSizeBytes ?? null,
        retentionDays: dto.retentionDays ?? null,
        createdById: userId,
        status: 'DRAFT',
        versions: {
          create: {
            versionNumber: 1,
            fileUrl: dto.fileUrl?.trim() || '',
            changelog: 'Version inicial',
            createdById: userId,
          },
        },
      },
      include: { category: true, versions: true },
    });
  }

  async listDocuments(filters?: { categoryId?: number; status?: string; search?: string }) {
    const where: any = {};
    if (filters?.categoryId) where.categoryId = filters.categoryId;
    if (filters?.status) where.status = filters.status;
    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { documentNumber: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.managedDocument.findMany({
      where,
      include: { category: true, createdBy: { select: { id: true, nombre: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getDocument(id: number) {
    const doc = await this.prisma.managedDocument.findUnique({
      where: { id },
      include: {
        category: true,
        versions: { orderBy: { versionNumber: 'desc' } },
        createdBy: { select: { id: true, nombre: true } },
        approvedBy: { select: { id: true, nombre: true } },
      },
    });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    return doc;
  }

  async uploadNewVersion(docId: number, dto: { fileUrl: string; changelog?: string }, userId: number) {
    const doc = await this.prisma.managedDocument.findUnique({ where: { id: docId }, include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    const nextVersion = (doc.versions[0]?.versionNumber || 0) + 1;

    await this.prisma.documentVersion.create({
      data: {
        documentId: docId,
        versionNumber: nextVersion,
        fileUrl: dto.fileUrl.trim(),
        changelog: dto.changelog?.trim() || null,
        createdById: userId,
      },
    });

    return this.prisma.managedDocument.update({
      where: { id: docId },
      data: {
        currentVersion: nextVersion,
        fileUrl: dto.fileUrl.trim(),
        status: 'PENDING_APPROVAL',
      },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
  }

  async approveDocument(id: number, userId: number) {
    return this.prisma.managedDocument.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: userId, approvedAt: new Date() },
    });
  }

  async archiveDocument(id: number) {
    return this.prisma.managedDocument.update({
      where: { id },
      data: { status: 'OBSOLETE' },
    });
  }

  async updateDocument(
    id: number,
    dto: { title?: string; description?: string; categoryId?: number | null; fileUrl?: string },
  ) {
    const doc = await this.prisma.managedDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.status === 'APPROVED' || doc.status === 'OBSOLETE') {
      throw new NotFoundException('Solo se pueden editar documentos en borrador o pendientes de aprobación');
    }
    return this.prisma.managedDocument.update({
      where: { id },
      data: {
        title: dto.title?.trim() ?? undefined,
        description: dto.description !== undefined ? (dto.description?.trim() || null) : undefined,
        categoryId: dto.categoryId !== undefined ? dto.categoryId : undefined,
        fileUrl: dto.fileUrl !== undefined ? (dto.fileUrl?.trim() || null) : undefined,
      },
      include: { category: true, createdBy: { select: { id: true, nombre: true } } },
    });
  }
}
