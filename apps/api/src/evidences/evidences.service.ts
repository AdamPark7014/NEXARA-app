import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CreateEvidenceDto } from './dto/create-evidence.dto.js';
import { UpdateEvidenceDto } from './dto/update-evidence.dto.js';
import { ServiceSheetsService } from '../service-sheets/service-sheets.service.js';
import { assertCompanyAccess, companyWhere, resolveRequiredCompanyId } from '../common/tenant/tenant-scope.js';

@Injectable()
export class EvidencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serviceSheetsService: ServiceSheetsService,
    private readonly notificationHierarchy: NotificationHierarchyService,
  ) {}

  // Exportar a CSV
  toCSV(evidences: any[]): string {
    if (!evidences.length) return '';
    const fields = Object.keys(evidences[0]);
    const csvRows = [fields.join(',')];
    for (const row of evidences) {
      csvRows.push(
        fields
          .map((f) => {
            let val = row[f];
            if (typeof val === 'object' && val !== null) {
              val = JSON.stringify(val);
            }
            if (typeof val === 'string' && val.includes(',')) {
              val = '"' + val.replace(/"/g, '""') + '"';
            }
            return val ?? '';
          })
          .join(','),
      );
    }
    return csvRows.join('\n');
  }

  // Importar muchas evidencias desde JSON
  async importMany(json: any[], companyId?: number | null): Promise<any[]> {
    if (!Array.isArray(json)) throw new Error('Formato inválido');
    const cid = await resolveRequiredCompanyId(this.prisma, companyId);
    const valid = json.filter(
      (e) => e.tipoEvidencia && e.archivoUrl && e.userId && e.actividadId,
    );
    const created: any[] = [];
    for (const dto of valid) {
      try {
        const activity = await this.prisma.activity.findFirst({
          where: { id: Number(dto.actividadId), companyId: cid },
          select: { id: true, companyId: true },
        });
        if (!activity) continue;
        const exists = await this.prisma['evidence'].findFirst({
          where: { archivoUrl: dto.archivoUrl, actividadId: dto.actividadId, companyId: cid },
        });
        if (!exists) {
          created.push(
            await this.prisma['evidence'].create({
              data: { ...dto, companyId: activity.companyId },
            }),
          );
        }
      } catch {
        // skip bad rows
      }
    }
    return created;
  }

  async create(createEvidenceDto: CreateEvidenceDto, companyId?: number | null) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: createEvidenceDto.actividadId },
      select: { id: true, companyId: true },
    });
    if (!activity) throw new BadRequestException('Actividad no encontrada');
    assertCompanyAccess(activity, companyId, 'Actividad');

    const evidence = await this.prisma['evidence'].create({
      data: {
        ...createEvidenceDto,
        companyId: activity.companyId,
      },
    });
    await this.maybeFinalizeActivity(evidence.actividadId);
    return evidence;
  }

  private async maybeFinalizeActivity(actividadId: number) {
    await this.serviceSheetsService.tryFinalizeActivity(actividadId);
  }

  private buildInclude() {
    return {
      user: true,
      aprobadoPor: true,
      actividad: {
        include: {
          creador: true,
          responsable: true,
        },
      },
    };
  }

  private hasPermission(user: { permissions?: string[]; isSuperAdmin?: boolean } | null | undefined, permission: string) {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    return Boolean(user.permissions?.includes(permission));
  }

  /** Roles v2 que tienen scope de equipo en evidencias (equivalente a CONSOLE_ADMIN legacy). */
  private static readonly V2_EVIDENCES_MANAGER_ROLES = new Set([
    'ceo', 'dir_admin', 'dir_operaciones', 'arquitecto',
    'coord_operaciones', 'coord_admin', 'ing_soporte',
  ]);

  private isEvidencesManager(user: { permissions?: string[]; isSuperAdmin?: boolean; roleKey?: string }): boolean {
    if (user.isSuperAdmin) return true;
    if (user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)) return true;
    return Boolean(user.roleKey && EvidencesService.V2_EVIDENCES_MANAGER_ROLES.has(user.roleKey));
  }

  private async getAccessibleUserIds(currentUser: {
    id: number;
    departmentId: number;
    permissions?: string[];
    isSuperAdmin?: boolean;
    roleKey?: string;
  }) {
    if (currentUser.isSuperAdmin) {
      const users = await this.prisma['user'].findMany({
        where: {
          email: {
            notIn: ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'],
          },
        },
        select: { id: true }
      });
      return users.map((u) => u.id);
    }

    if (this.isEvidencesManager(currentUser)) {
      const users = await this.prisma['user'].findMany({
        where: {
          departmentId: currentUser.departmentId,
          role: {
            accesoConsoleAdmin: false,
          },
        },
        select: { id: true },
      });
      return [currentUser.id, ...users.map((u) => u.id)];
    }

    if (!this.hasPermission(currentUser, PERMISSIONS.EVIDENCES_REVIEW)) {
      return [currentUser.id];
    }

    const users = await this.prisma['user'].findMany({
      where: {
        departmentId: currentUser.departmentId,
        role: { accesoEvidencias: true },
      },
      select: { id: true },
    });

    return [currentUser.id, ...users.map((u) => u.id)];
  }

  async findForHierarchy(currentUser: {
    id: number;
    departmentId: number;
    permissions?: string[];
    isSuperAdmin?: boolean;
    roleKey?: string;
  }, query?: PaginationQueryDto, companyId?: number | null) {
    const userIds = await this.getAccessibleUserIds(currentUser);
    const where = { userId: { in: userIds }, ...companyWhere(companyId ?? null) };
    const include = this.buildInclude();
    const orderBy = { subidoEn: 'desc' as const };
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma['evidence'].findMany({ where, include, orderBy, skip: query.skip, take: query.take }),
        this.prisma['evidence'].count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma['evidence'].findMany({ where, include, orderBy });
  }

  async findAll(query?: PaginationQueryDto, companyId?: number | null) {
    const where = companyWhere(companyId ?? null);
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma['evidence'].findMany({ where, include: this.buildInclude(), orderBy: { subidoEn: 'desc' }, skip: query.skip, take: query.take }),
        this.prisma['evidence'].count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma['evidence'].findMany({
      where,
      include: this.buildInclude(),
      orderBy: { subidoEn: 'desc' },
    });
  }

  findByDepartment(departmentId: number, companyId?: number | null) {
    return this.prisma['evidence'].findMany({
      where: { user: { departmentId }, ...companyWhere(companyId ?? null) },
      include: this.buildInclude(),
      orderBy: { subidoEn: 'desc' },
    });
  }

  findByUser(userId: number, companyId?: number | null) {
    return this.prisma['evidence'].findMany({
      where: { userId, ...companyWhere(companyId ?? null) },
      include: this.buildInclude(),
      orderBy: { subidoEn: 'desc' },
    });
  }

  findByAllowedUsers(userIds: number[], companyId?: number | null) {
    if (!userIds || userIds.length === 0) return [];
    return this.prisma['evidence'].findMany({
      where: { userId: { in: userIds }, ...companyWhere(companyId ?? null) },
      include: this.buildInclude(),
      orderBy: { subidoEn: 'desc' },
    });
  }

  async findOne(id: number, companyId?: number | null) {
    const evidence = await this.prisma['evidence'].findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
      include: this.buildInclude(),
    });
    assertCompanyAccess(evidence, companyId, 'Evidencia');
    return evidence;
  }

  async update(id: number, updateEvidenceDto: UpdateEvidenceDto, companyId?: number | null) {
    await this.findOne(id, companyId);
    return this.prisma['evidence'].update({
      where: { id },
      data: updateEvidenceDto,
    });
  }

  async remove(id: number, companyId?: number | null) {
    await this.findOne(id, companyId);
    return this.prisma['evidence'].delete({ where: { id } });
  }

  async removeOwn(id: number, userId: number, companyId?: number | null) {
    const evidence = await this.prisma['evidence'].findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
    });
    if (!evidence) throw new NotFoundException('Evidencia no encontrada');
    assertCompanyAccess(evidence, companyId, 'Evidencia');
    if (evidence.userId !== userId) {
      throw new ForbiddenException('No autorizado para eliminar esta evidencia');
    }
    if (evidence.estatus && evidence.estatus !== 'Pendiente') {
      throw new ForbiddenException('Solo puedes eliminar evidencias pendientes');
    }
    return this.prisma['evidence'].delete({ where: { id } });
  }
}
