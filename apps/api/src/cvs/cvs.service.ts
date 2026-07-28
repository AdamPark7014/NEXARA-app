import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { PERMISSIONS } from '../common/permissions.js';
import { assertCompanyAccess, companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';

type CurrentUser = {
  id: number;
  isSuperAdmin?: boolean;
  permissions?: string[];
};

type CvStageValue =
  | 'INBOX'
  | 'RECRUITER_SHORTLIST'
  | 'RECRUITER_REJECTED'
  | 'ADMIN_SHORTLIST'
  | 'ADMIN_REJECTED'
  | 'SUPERADMIN_SHORTLIST'
  | 'SUPERADMIN_REJECTED'
  | 'APPROVED';

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

  private resolveTier(user: CurrentUser): 'superadmin' | 'admin' | 'recruiter' {
    if (user.isSuperAdmin) return 'superadmin';
    if (this.isAdmin(user) || user.permissions?.includes(PERMISSIONS.CVS_ADMIN_REVIEW)) return 'admin';
    return 'recruiter';
  }

  private getAllowedStagesByTier(tier: 'superadmin' | 'admin' | 'recruiter'): CvStageValue[] {
    if (tier === 'superadmin') {
      return [
        'INBOX',
        'RECRUITER_SHORTLIST',
        'RECRUITER_REJECTED',
        'ADMIN_SHORTLIST',
        'ADMIN_REJECTED',
        'SUPERADMIN_SHORTLIST',
        'SUPERADMIN_REJECTED',
        'APPROVED',
      ];
    }
    if (tier === 'admin') {
      return ['ADMIN_SHORTLIST', 'ADMIN_REJECTED', 'SUPERADMIN_SHORTLIST'];
    }
    return ['INBOX', 'RECRUITER_SHORTLIST', 'RECRUITER_REJECTED'];
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
    companyId?: number | null,
  ) {
    this.ensureRecruiterAccess(user);
    const tenantId = requireCompanyId(companyId);

    const lastOrder = await this.cv.aggregate({
      _max: { sortOrder: true },
      where: { stage: 'INBOX', ...companyWhere(tenantId) },
    });

    return this.cv.create({
      data: {
        companyId: tenantId,
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
    pagination?: PaginationQueryDto,
    companyId?: number | null,
  ) {
    this.ensureRecruiterAccess(user);
    const tenantId = requireCompanyId(companyId);

    const where: any = { ...companyWhere(tenantId) };
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

    const include = {
      createdBy: { select: { id: true, nombre: true, email: true } },
      recruiterReviewedBy: { select: { id: true, nombre: true, email: true } },
      adminReviewedBy: { select: { id: true, nombre: true, email: true } },
      superadminReviewedBy: { select: { id: true, nombre: true, email: true } },
    };
    const orderBy = [{ stage: 'asc' as const }, { sortOrder: 'asc' as const }, { updatedAt: 'desc' as const }];

    if (pagination?.limit) {
      const [data, total] = await Promise.all([
        this.cv.findMany({ where, orderBy, include, skip: pagination.skip, take: pagination.take }),
        this.cv.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, pagination);
    }

    const rows = await this.cv.findMany({ where, orderBy, include });

    return rows;
  }

  async summary(user: CurrentUser, companyId?: number | null) {
    this.ensureRecruiterAccess(user);
    const tenantId = requireCompanyId(companyId);
    const rows: Array<{
      stage: string;
      category: string | null;
      employmentStatus: string;
      recruiterDecision: string;
      adminDecision: string;
      superadminDecision: string;
    }> = await this.cv.findMany({
      where: companyWhere(tenantId),
      select: {
        stage: true,
        category: true,
        employmentStatus: true,
        recruiterDecision: true,
        adminDecision: true,
        superadminDecision: true,
      },
    });

    const byStage: Record<string, number> = rows.reduce((accumulator: Record<string, number>, row) => {
      accumulator[row.stage] = (accumulator[row.stage] || 0) + 1;
      return accumulator;
    }, {});

    const byCategory: Record<string, number> = rows.reduce((accumulator: Record<string, number>, row) => {
      const key = row.category || 'Sin categoría';
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});

    const totals = {
      all: rows.length,
      recruiterApproved: rows.filter((row) => row.recruiterDecision === 'APPROVED').length,
      adminApproved: rows.filter((row) => row.adminDecision === 'APPROVED').length,
      superadminApproved: rows.filter((row) => row.superadminDecision === 'APPROVED').length,
      rejected: rows.filter((row) => row.stage.includes('REJECTED')).length,
    };

    return {
      totals,
      byStage,
      byCategory,
    };
  }

  async recruiterReview(
    user: CurrentUser,
    id: number,
    body: { decision: 'APPROVED' | 'REJECTED' | 'PENDING'; notes?: string; category?: string; tags?: string[]; employmentStatus?: string },
    companyId?: number | null,
  ) {
    this.ensureRecruiterAccess(user);
    const tenantId = requireCompanyId(companyId);
    const current = await this.cv.findFirst({ where: { id, ...companyWhere(tenantId) } });
    assertCompanyAccess(current, tenantId, 'CV');

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

  async adminReview(
    user: CurrentUser,
    id: number,
    body: { decision: 'APPROVED' | 'REJECTED' | 'PENDING'; notes?: string },
    companyId?: number | null,
  ) {
    this.ensureAdminAccess(user);
    const tenantId = requireCompanyId(companyId);

    const current = await this.cv.findFirst({ where: { id, ...companyWhere(tenantId) } });
    assertCompanyAccess(current, tenantId, 'CV');
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

  async superadminReview(
    user: CurrentUser,
    id: number,
    body: { decision: 'APPROVED' | 'REJECTED' | 'PENDING'; notes?: string },
    companyId?: number | null,
  ) {
    this.ensureSuperadminAccess(user);
    const tenantId = requireCompanyId(companyId);

    const current = await this.cv.findFirst({ where: { id, ...companyWhere(tenantId) } });
    assertCompanyAccess(current, tenantId, 'CV');

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

  async move(user: CurrentUser, id: number, stage: CvStageValue, sortOrder?: number, companyId?: number | null) {
    this.ensureRecruiterAccess(user);
    const tenantId = requireCompanyId(companyId);

    const tier = this.resolveTier(user);
    const allowedStages = this.getAllowedStagesByTier(tier);
    if (!allowedStages.includes(stage)) {
      throw new ForbiddenException('No tienes permisos para mover CVs a esa etapa');
    }

    const target = await this.cv.findFirst({ where: { id, ...companyWhere(tenantId) } });
    assertCompanyAccess(target, tenantId, 'CV');

    return this.cv.update({
      where: { id },
      data: {
        stage: stage as any,
        sortOrder: Number.isFinite(sortOrder) ? Number(sortOrder) : target.sortOrder,
      },
    });
  }

  async reorder(user: CurrentUser, stage: CvStageValue, orderedIds: number[], companyId?: number | null) {
    this.ensureRecruiterAccess(user);
    const tenantId = requireCompanyId(companyId);

    const tier = this.resolveTier(user);
    const allowedStages = this.getAllowedStagesByTier(tier);
    if (!allowedStages.includes(stage)) {
      throw new ForbiddenException('No tienes permisos para ordenar esa etapa');
    }

    const scoped = await this.cv.findMany({
      where: { id: { in: orderedIds }, ...companyWhere(tenantId) },
      select: { id: true },
    });
    if (scoped.length !== orderedIds.length) {
      throw new NotFoundException('CV no encontrado');
    }

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

  async getById(user: CurrentUser, id: number, companyId?: number | null) {
    this.ensureRecruiterAccess(user);
    const tenantId = requireCompanyId(companyId);
    const row = await this.cv.findFirst({
      where: { id, ...companyWhere(tenantId) },
      include: {
        createdBy: { select: { id: true, nombre: true, email: true } },
        recruiterReviewedBy: { select: { id: true, nombre: true, email: true } },
        adminReviewedBy: { select: { id: true, nombre: true, email: true } },
        superadminReviewedBy: { select: { id: true, nombre: true, email: true } },
      },
    });
    assertCompanyAccess(row, tenantId, 'CV');
    return row!;
  }

  async getUserPrefill(user: CurrentUser, id: number, companyId?: number | null) {
    this.ensureAdminAccess(user);
    const tenantId = requireCompanyId(companyId);
    const row = await this.cv.findFirst({ where: { id, ...companyWhere(tenantId) } });
    assertCompanyAccess(row, tenantId, 'CV');

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
