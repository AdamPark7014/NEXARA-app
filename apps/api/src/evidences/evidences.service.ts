import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CreateEvidenceDto } from './dto/create-evidence.dto.js';
import { UpdateEvidenceDto } from './dto/update-evidence.dto.js';
import { ServiceSheetsService } from '../service-sheets/service-sheets.service.js';

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
  async importMany(json: any[]): Promise<any[]> {
    if (!Array.isArray(json)) throw new Error('Formato inválido');
    // Validar campos mínimos
    const valid = json.filter(
      (e) => e.tipoEvidencia && e.archivoUrl && e.userId && e.actividadId,
    );
    const created: any[] = [];
    for (const dto of valid) {
      try {
        // Evitar duplicados por archivoUrl y actividadId
        const exists = await this.prisma['evidence'].findFirst({
          where: { archivoUrl: dto.archivoUrl, actividadId: dto.actividadId },
        });
        if (!exists) {
          created.push(await this.prisma['evidence'].create({ data: dto }));
        }
      } catch (err) {
        // opcional: log error
      }
    }
    return created;
  }

  create(createEvidenceDto: CreateEvidenceDto) {
    return this.prisma['evidence'].create({ data: createEvidenceDto }).then(async (evidence) => {
      await this.maybeFinalizeActivity(evidence.actividadId);
      return evidence;
    });
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
      // Superadmin: ve todos EXCEPTO otros superadmins
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
      // Admin consola o manager v2: ve a él mismo + usuarios normales sin accesoConsoleAdmin
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
  }, query?: PaginationQueryDto) {
    const userIds = await this.getAccessibleUserIds(currentUser);
    const where = { userId: { in: userIds } };
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

  async findAll(query?: PaginationQueryDto) {
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma['evidence'].findMany({ include: this.buildInclude(), orderBy: { subidoEn: 'desc' }, skip: query.skip, take: query.take }),
        this.prisma['evidence'].count(),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma['evidence'].findMany({
      include: this.buildInclude(),
      orderBy: { subidoEn: 'desc' },
    });
  }

  findByDepartment(departmentId: number) {
    return this.prisma['evidence'].findMany({
      where: { user: { departmentId } },
      include: this.buildInclude(),
      orderBy: { subidoEn: 'desc' },
    });
  }

  findByUser(userId: number) {
    return this.prisma['evidence'].findMany({
      where: { userId },
      include: this.buildInclude(),
      orderBy: { subidoEn: 'desc' },
    });
  }

  findByAllowedUsers(userIds: number[]) {
    if (!userIds || userIds.length === 0) return [];
    return this.prisma['evidence'].findMany({
      where: { userId: { in: userIds } },
      include: this.buildInclude(),
      orderBy: { subidoEn: 'desc' },
    });
  }

  findOne(id: number) {
    return this.prisma['evidence'].findUnique({
      where: { id },
      include: this.buildInclude(),
    });
  }

  async update(id: number, updateEvidenceDto: UpdateEvidenceDto) {
    const updated = await this.prisma['evidence'].update({
      where: { id },
      data: updateEvidenceDto,
    });

    return updated;
  }

  remove(id: number) {
    return this.prisma['evidence'].delete({ where: { id } });
  }

  async removeOwn(id: number, userId: number) {
    const evidence = await this.prisma['evidence'].findUnique({ where: { id } });
    if (!evidence) return null;
    if (evidence.userId !== userId) {
      throw new ForbiddenException('No autorizado para eliminar esta evidencia');
    }
    if (evidence.estatus && evidence.estatus !== 'Pendiente') {
      throw new ForbiddenException('Solo puedes eliminar evidencias pendientes');
    }
    return this.prisma['evidence'].delete({ where: { id } });
  }
}
