import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import * as bcrypt from 'bcryptjs';
import { PERMISSIONS } from '../common/permissions.js';

@Injectable()
export class UsersService {
  private readonly superAdminEmails = ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'];
  private readonly employeeNumberPrefix = 'NXR25SYS';

  private normalizeEmployeeNumber(value?: string | null) {
    const normalized = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!normalized) return null;

    // Allow short numeric input like "4" or "04" and normalize it to
    // the canonical employee number format (NXR25SYS004).
    if (/^\d+$/.test(normalized)) {
      const parsed = Number.parseInt(normalized, 10);
      return this.formatEmployeeNumberFromId(parsed);
    }

    // Normalize already-prefixed values so numeric suffix keeps fixed width.
    if (normalized.startsWith(this.employeeNumberPrefix)) {
      const suffix = normalized.slice(this.employeeNumberPrefix.length).replace(/\D+/g, '');
      if (suffix) {
        return `${this.employeeNumberPrefix}${suffix.padStart(3, '0')}`;
      }
    }

    return normalized;
  }

  private formatEmployeeNumberFromId(id: number) {
    const safeId = Number.isFinite(id) && id > 0 ? id : 0;
    return `${this.employeeNumberPrefix}${String(safeId).padStart(3, '0')}`;
  }

  private withEmployeeNumber<T extends { id: number; email?: string | null; employeeNumber?: string | null }>(item: T) {
    if (this.isProtectedSuperAdminEmail(item.email)) {
      return {
        ...item,
        employeeNumber: null,
      };
    }

    return {
      ...item,
      employeeNumber: this.normalizeEmployeeNumber(item.employeeNumber) || this.formatEmployeeNumberFromId(item.id),
    };
  }

  private withEmployeeNumberList<T extends { id: number; email?: string | null; employeeNumber?: string | null }>(items: T[]) {
    return items.map((item) => this.withEmployeeNumber(item));
  }

  private async clearEmployeeNumberForProtectedUsers() {
    await this.prisma['user'].updateMany({
      where: {
        email: { in: this.superAdminEmails },
        employeeNumber: { not: null },
      },
      data: { employeeNumber: null },
    });
  }

  private async resolveEmployeeNumber(employeeNumber: string | undefined, fallbackId: number, excludeUserId?: number) {
    const normalized = this.normalizeEmployeeNumber(employeeNumber) || this.formatEmployeeNumberFromId(fallbackId);

    // Keep protected superadmin users without employee numbers so they never
    // consume values from the operational employee numbering sequence.
    await this.clearEmployeeNumberForProtectedUsers();

    const existing = await this.prisma['user'].findFirst({
      where: {
        employeeNumber: normalized,
        email: { notIn: this.superAdminEmails },
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true, email: true, nombre: true },
    });

    if (existing) {
      if (this.isProtectedSuperAdminEmail(existing.email)) {
        throw new BadRequestException('El numero de empleado ya existe (reservado por un usuario protegido no visible en la lista)');
      }

      throw new BadRequestException(`El numero de empleado ya existe (usuario: ${existing.nombre || existing.email})`);
    }

    return normalized;
  }

  async getNextEmployeeNumber() {
    const lastUser = await this.prisma['user'].findFirst({
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    const nextId = (lastUser?.id || 0) + 1;
    return this.formatEmployeeNumberFromId(nextId);
  }

  // Obtener un rol por ID
  async getRoleById(roleId: unknown) {
    const resolvedRoleId = await this.resolveRoleId(roleId);
    return this.prisma['role'].findUnique({ where: { id: resolvedRoleId } });
  }
  private canManageUsers(currentUser: { permissions?: string[]; isSuperAdmin?: boolean }) {
    if (currentUser.isSuperAdmin) return true;
    return Boolean(
      currentUser.permissions?.includes(PERMISSIONS.USERS_MANAGE) ||
      currentUser.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN),
    );
  }

  private isProtectedSuperAdminEmail(email?: string | null) {
    const normalized = String(email || '').toLowerCase();
    return this.superAdminEmails.includes(normalized);
  }

  async findAllVisible(currentUser: { id: number; departmentId: number; permissions?: string[]; isSuperAdmin?: boolean }, query?: PaginationQueryDto) {
    const excludeSuperAdmins = {
      NOT: { email: { in: this.superAdminEmails } },
    };
    const include = { role: true, department: true };

    let where: any;
    if (currentUser.isSuperAdmin) {
      where = excludeSuperAdmins;
    } else if (this.canManageUsers(currentUser)) {
      where = { AND: [{ role: { accesoConsoleAdmin: false } }, excludeSuperAdmins] };
    } else {
      where = { id: currentUser.id, ...excludeSuperAdmins };
    }

    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma['user'].findMany({ where, include, skip: query.skip, take: query.take }),
        this.prisma['user'].count({ where }),
      ]);
      const paginated = buildPaginatedResponse(data, total, query);
      return {
        ...paginated,
        data: this.withEmployeeNumberList(paginated.data || []),
      };
    }
    const users = await this.prisma['user'].findMany({ where, include });
    return this.withEmployeeNumberList(users);
  }
  constructor(private readonly prisma: PrismaService) {}

  private async resolveRoleId(value: unknown) {
    if (value === undefined || value === null) {
      throw new BadRequestException('Rol requerido');
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    throw new BadRequestException('Rol inválido');
  }

  private async resolveDepartmentId(value: unknown) {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) return parsed;
      const department = await this.prisma['department'].upsert({
        where: { nombre: trimmed },
        update: {},
        create: { nombre: trimmed },
        select: { id: true },
      });
      if (department?.id) return department.id;
    }
    throw new BadRequestException('Departamento inválido');
  }

  async create(createUserDto: CreateUserDto) {
    await this.clearEmployeeNumberForProtectedUsers();

    const hash = await bcrypt.hash(createUserDto.password, 10);
    const roleId = await this.resolveRoleId(createUserDto.roleId);
    const departmentId = await this.resolveDepartmentId(createUserDto.departmentId);
    if (!departmentId) throw new BadRequestException('Departamento requerido');
    const createdUser = await this.prisma['user'].create({
      data: {
        nombre: createUserDto.nombre,
        email: createUserDto.email,
        roleId,
        departmentId,
        avatarUrl: createUserDto.avatarUrl,
        passwordHash: hash,
      },
    });

    if (this.isProtectedSuperAdminEmail(createdUser.email)) {
      return this.withEmployeeNumber(createdUser);
    }

    const employeeNumber = await this.resolveEmployeeNumber(createUserDto.employeeNumber, createdUser.id, createdUser.id);
    const updatedUser = await this.prisma['user'].update({
      where: { id: createdUser.id },
      data: { employeeNumber },
    });
    return this.withEmployeeNumber(updatedUser);
  }


  async findAll(query?: PaginationQueryDto) {
    const include = { role: true, department: true };
    if (query?.limit) {
      const where = query.search ? { OR: [{ nombre: { contains: query.search, mode: 'insensitive' as const } }, { email: { contains: query.search, mode: 'insensitive' as const } }] } : undefined;
      const [data, total] = await Promise.all([
        this.prisma['user'].findMany({ where, include, skip: query.skip, take: query.take, orderBy: { fechaCreacion: 'desc' } }),
        this.prisma['user'].count({ where }),
      ]);
      const paginated = buildPaginatedResponse(data, total, query);
      return {
        ...paginated,
        data: this.withEmployeeNumberList(paginated.data || []),
      };
    }
    const users = await this.prisma['user'].findMany({
      include,
    });
    return this.withEmployeeNumberList(users);
  }

  async findAssignableUsers(currentUser: { id: number; departmentId: number; permissions?: string[]; isSuperAdmin?: boolean; role?: any }) {
    try {
      // SuperAdmin emails (siempre excluir)
      const superAdminEmails = this.superAdminEmails;

      // Cargar usuario actual de la BD para obtener rol actual
      const userInDb = await this.prisma['user'].findUnique({
        where: { id: currentUser.id },
        include: { role: true },
      });

      if (!userInDb) return [];

      // Si el usuario actual es SuperAdmin (email o bandera)
      const isSuperAdmin = currentUser.isSuperAdmin || superAdminEmails.includes(userInDb.email);
      
      if (isSuperAdmin) {
        // SuperAdmin puede asignar a TODOS excepto a sí mismo y otros superadmins
        return this.prisma['user'].findMany({
          where: {
            AND: [
              { id: { not: currentUser.id } },
              { email: { notIn: superAdminEmails } },
            ],
          },
          select: { id: true, nombre: true, email: true, role: true, avatarUrl: true },
          orderBy: { nombre: 'asc' },
        });
      }

      const hasConsoleAdminPermission = Boolean(currentUser.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN));
      const hasUsersManagePermission = Boolean(currentUser.permissions?.includes(PERMISSIONS.USERS_MANAGE));
      // Fallback por rol para compatibilidad con cuentas antiguas
      const isConsoleAdminByRole = userInDb.role?.accesoConsoleAdmin === true;
      const canAssignByHierarchy = hasConsoleAdminPermission || hasUsersManagePermission || isConsoleAdminByRole;
      
      if (canAssignByHierarchy) {
        // Admin puede asignar a usuarios normales (sin accesoConsoleAdmin) de cualquier departamento
        return this.prisma['user'].findMany({
          where: {
            AND: [
              { id: { not: currentUser.id } },
              { email: { notIn: superAdminEmails } },
              { role: { accesoConsoleAdmin: false } }, // Solo usuarios normales
            ],
          },
          select: { id: true, nombre: true, email: true, role: true, avatarUrl: true },
          orderBy: { nombre: 'asc' },
        });
      }

      // Usuario normal sin permisos: retorna vacío
      return [];
    } catch (error) {
      console.error('Error finding assignable users:', error);
      return [];
    }
  }

  findByDepartment(departmentId: number) {
    return this.prisma['user'].findMany({
      where: { departmentId },
      include: { role: true, department: true },
    });
  }

  findOne(id: number) {
    return this.prisma['user'].findUnique({
      where: { id },
      include: { role: true, department: true },
    }).then((user) => (user ? this.withEmployeeNumber(user) : user));
  }

  async getProfile(userId: number) {
    return this.prisma['user'].findUnique({
      where: { id: userId },
      include: {
        perfil: true,
        documentos: { orderBy: { createdAt: 'desc' } },
        role: true,
        department: true,
      },
    });
  }

  async getAuthorizedDocument(documentId: number, currentUser: { id: number; permissions?: string[]; isSuperAdmin?: boolean }) {
    const document = await this.prisma['userDocument'].findUnique({
      where: { id: documentId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: { select: { accesoConsoleAdmin: true } },
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    if (currentUser.id === document.userId) {
      return document;
    }

    if (currentUser.isSuperAdmin) {
      return document;
    }

    const requester = await this.prisma['user'].findUnique({
      where: { id: currentUser.id },
      select: {
        email: true,
        role: { select: { accesoConsoleAdmin: true } },
      },
    });

    if (!requester) {
      throw new ForbiddenException('No autorizado para descargar este documento');
    }

    if (this.isProtectedSuperAdminEmail(requester.email)) {
      return document;
    }

    const requesterIsAdmin =
      this.canManageUsers(currentUser) ||
      Boolean(requester.role?.accesoConsoleAdmin);

    if (!requesterIsAdmin) {
      throw new ForbiddenException('No autorizado para descargar este documento');
    }

    const ownerIsSuperAdmin = this.isProtectedSuperAdminEmail(document.user?.email);
    const ownerIsAdmin = Boolean(document.user?.role?.accesoConsoleAdmin);

    if (ownerIsSuperAdmin || ownerIsAdmin) {
      throw new ForbiddenException('No autorizado para descargar este documento');
    }

    return document;
  }

  async upsertProfile(userId: number, data: any) {
    return this.prisma['userProfile'].upsert({
      where: { userId },
      update: {
        ...data,
        estatus: 'Pendiente',
        observaciones: null,
        aprobadoPorId: null,
        revisadoEn: null,
      },
      create: { ...data, userId, estatus: 'Pendiente' },
    });
  }

  async addDocuments(userId: number, documents: { tipo: string; archivoUrl: string }[]) {
    const created: any[] = [];
    for (const doc of documents) {
      created.push(
        await this.prisma['userDocument'].create({
          data: { userId, tipo: doc.tipo, archivoUrl: doc.archivoUrl },
        }),
      );
    }
    return created;
  }

  async updateProfileReview(userId: number, data: any) {
    return this.prisma['userProfile'].update({
      where: { userId },
      data,
    });
  }

  async updateDocumentReview(id: number, data: any) {
    return this.prisma['userDocument'].update({
      where: { id },
      data,
    });
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    await this.clearEmployeeNumberForProtectedUsers();

    const data: any = { ...updateUserDto };
    const currentUser = await this.prisma['user'].findUnique({
      where: { id },
      select: { email: true },
    });

    const nextEmail = data.email !== undefined ? String(data.email || '') : String(currentUser?.email || '');
    const isProtectedUser = this.isProtectedSuperAdminEmail(nextEmail);

    if (data.password) {
      data.passwordHash = await bcrypt.hash(data.password, 10);
      delete data.password;
    }
    if (data.roleId !== undefined) {
      data.roleId = await this.resolveRoleId(data.roleId);
    }
    if (data.departmentId !== undefined) {
      data.departmentId = await this.resolveDepartmentId(data.departmentId);
    }
    if (isProtectedUser) {
      data.employeeNumber = null;
    } else if (data.employeeNumber !== undefined) {
      data.employeeNumber = await this.resolveEmployeeNumber(data.employeeNumber, id, id);
    }
    if (data.avatarUrl !== undefined) {
      const normalizedAvatar = String(data.avatarUrl ?? '').trim();
      data.avatarUrl = normalizedAvatar ? normalizedAvatar : null;
    }
    return this.prisma['user'].update({
      where: { id },
      data,
    }).then((user) => this.withEmployeeNumber(user));
  }

  remove(id: number) {
    return this.prisma['user'].delete({ where: { id } });
  }
}
