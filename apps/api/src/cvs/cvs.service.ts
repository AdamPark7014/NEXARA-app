import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PERMISSIONS } from '../common/permissions.js';

type CurrentUser = {
  id: number;
  isSuperAdmin?: boolean;
  permissions?: string[];
};

@Injectable()
export class CvsService {
  constructor(private readonly prisma: PrismaService) {}

  private get cv() {
    return (this.prisma as any).cvCandidate;
  }

  private isAdmin(user: CurrentUser) {
    return Boolean(user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN));
  }

  private ensureRecruiterAccess(user: CurrentUser) {
    if (user.isSuperAdmin) return;
    if (this.isAdmin(user)) return;
    if (user.permissions?.includes(PERMISSIONS.CVS_MANAGE)) return;
    throw new ForbiddenException('No tienes permisos para gestionar CVs');
  }

  private ensureAdminAccess(user: CurrentUser) {
    if (user.isSuperAdmin) return;
    if (this.isAdmin(user) || user.permissions?.includes(PERMISSIONS.CVS_ADMIN_REVIEW)) return;
    throw new ForbiddenException('No tienes permisos para revisión admin de CVs');
  }

  private ensureSuperadminAccess(user: CurrentUser) {
    if (user.isSuperAdmin) return;
    throw new ForbiddenException('Solo superadmin puede realizar esta acción');
  }

  async create(
    user: CurrentUser,
    payload: {
      fullName: string;
      email?: string;
      whatsapp?: string;
      category: string;
      tags?: string[];
      employmentStatus?: string;
      recruiterNotes?: string;
      cvFileUrl: string;
    },
  ) {
    this.ensureRecruiterAccess(user);

    const lastOrder = await this.cv.aggregate({
      _max: { sortOrder: true },
      where: { stage: 'INBOX' },
    });

    return this.cv.create({
      data: {
        fullName: payload.fullName,
        email: payload.email || null,
        whatsapp: payload.whatsapp || null,
        category: payload.category,
        tags: payload.tags || [],
        recruiterNotes: payload.recruiterNotes || null,
        employmentStatus: (payload.employmentStatus as any) || 'NEW_CANDIDATE',
        cvFileUrl: payload.cvFileUrl,
        createdById: user.id,
        sortOrder: (lastOrder._max.sortOrder ?? 0) + 1,
      },
    });
  }

  async list(
    user: CurrentUser,
    query: {
      search?: string;
      category?: string;
      stage?: string;
      employmentStatus?: string;
      onlyMine?: string;
    },
  ) {
    this.ensureRecruiterAccess(user);

    const where: any = {};
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { whatsapp: { contains: query.search, mode: 'insensitive' } },
        { category: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.category) where.category = query.category;
    if (query.stage) where.stage = query.stage;
    if (query.employmentStatus) where.employmentStatus = query.employmentStatus;
    if (query.onlyMine === 'true') {
      where.OR = [
        ...(where.OR || []),
        { createdById: user.id },
        { recruiterReviewedById: user.id },
      ];
    }

    const rows = await this.cv.findMany({
      where,
      orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }, { updatedAt: 'desc' }],
      include: {
        createdBy: { select: { id: true, nombre: true, email: true } },
        recruiterReviewedBy: { select: { id: true, nombre: true, email: true } },
        adminReviewedBy: { select: { id: true, nombre: true, email: true } },
        superadminReviewedBy: { select: { id: true, nombre: true, email: true } },
      },
    });

    return rows;
  }

  async recruiterReview(
    user: CurrentUser,
    id: number,
    body: { decision: 'APPROVED' | 'REJECTED' | 'PENDING'; notes?: string; category?: string; tags?: string[]; employmentStatus?: string },
  ) {
    this.ensureRecruiterAccess(user);

    const stage = body.decision === 'APPROVED' ? 'RECRUITER_SHORTLIST' : body.decision === 'REJECTED' ? 'RECRUITER_REJECTED' : 'INBOX';

    return this.cv.update({
      where: { id },
      data: {
        recruiterDecision: body.decision,
        recruiterNotes: body.notes ?? undefined,
        recruiterReviewedById: user.id,
        recruiterReviewedAt: new Date(),
        category: body.category ?? undefined,
        tags: body.tags ?? undefined,
        employmentStatus: (body.employmentStatus as any) ?? undefined,
        stage: stage as any,
      },
    });
  }

  async adminReview(user: CurrentUser, id: number, body: { decision: 'APPROVED' | 'REJECTED' | 'PENDING'; notes?: string }) {
    this.ensureAdminAccess(user);

    const current = await this.cv.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('CV no encontrado');
    if (current.recruiterDecision !== 'APPROVED' && !user.isSuperAdmin) {
      throw new BadRequestException('Este CV aún no fue aprobado por reclutamiento');
    }

    const stage = body.decision === 'APPROVED' ? 'ADMIN_SHORTLIST' : body.decision === 'REJECTED' ? 'ADMIN_REJECTED' : current.stage;

    return this.cv.update({
      where: { id },
      data: {
        adminDecision: body.decision,
        adminNotes: body.notes ?? undefined,
        adminReviewedById: user.id,
        adminReviewedAt: new Date(),
        stage: stage as any,
      },
    });
  }

  async superadminReview(user: CurrentUser, id: number, body: { decision: 'APPROVED' | 'REJECTED' | 'PENDING'; notes?: string }) {
    this.ensureSuperadminAccess(user);

    const current = await this.cv.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('CV no encontrado');

    const stage = body.decision === 'APPROVED' ? 'APPROVED' : body.decision === 'REJECTED' ? 'SUPERADMIN_REJECTED' : 'SUPERADMIN_SHORTLIST';

    return this.cv.update({
      where: { id },
      data: {
        superadminDecision: body.decision,
        superadminNotes: body.notes ?? undefined,
        superadminReviewedById: user.id,
        superadminReviewedAt: new Date(),
        stage: stage as any,
      },
    });
  }

  async move(user: CurrentUser, id: number, stage: string, sortOrder?: number) {
    this.ensureRecruiterAccess(user);

    const target = await this.cv.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('CV no encontrado');

    return this.cv.update({
      where: { id },
      data: {
        stage: stage as any,
        sortOrder: Number.isFinite(sortOrder) ? Number(sortOrder) : target.sortOrder,
      },
    });
  }

  async reorder(user: CurrentUser, stage: string, orderedIds: number[]) {
    this.ensureRecruiterAccess(user);

    await this.prisma.$transaction(
      orderedIds.map((cvId, index) =>
        this.cv.update({
          where: { id: cvId },
          data: { stage: stage as any, sortOrder: index },
        }),
      ),
    );

    return { ok: true };
  }

  async getById(user: CurrentUser, id: number) {
    this.ensureRecruiterAccess(user);
    const row = await this.cv.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, nombre: true, email: true } },
        recruiterReviewedBy: { select: { id: true, nombre: true, email: true } },
        adminReviewedBy: { select: { id: true, nombre: true, email: true } },
        superadminReviewedBy: { select: { id: true, nombre: true, email: true } },
      },
    });
    if (!row) throw new NotFoundException('CV no encontrado');
    return row;
  }

  async getUserPrefill(user: CurrentUser, id: number) {
    this.ensureAdminAccess(user);
    const row = await this.cv.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('CV no encontrado');

    const canCreate = row.superadminDecision === 'APPROVED' || user.isSuperAdmin;
    if (!canCreate) {
      throw new ForbiddenException('El superadmin debe aprobar primero este candidato');
    }

    const [firstNameRaw, ...lastParts] = String(row.fullName || '').trim().split(/\s+/);
    const firstName = (firstNameRaw || 'usuario').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
    const lastName = (lastParts[0] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
    const category = String(row.category || 'colaborador').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
    const suggestionLocal = [firstName, lastName || category].filter(Boolean).join('.');
    const suggestedEmail = `${suggestionLocal || 'colaborador'}@nexara.com.mx`.replace('..', '.');

    return {
      candidateId: row.id,
      fullName: row.fullName,
      category: row.category,
      whatsapp: row.whatsapp,
      email: row.email,
      suggestedEmail,
      canCreate,
    };
  }
}
