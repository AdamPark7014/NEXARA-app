import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import * as bcrypt from 'bcryptjs';
import { PERMISSIONS } from '../common/permissions.js';
import { ChatService } from '../chat/chat.service.js';
import { companyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';
import { withTenantBypassAsync } from '../common/tenant/tenant-context.js';
import { IntegraAcsFanoutService } from '../integra/integra-acs-fanout.service.js';

/** Roles que reciben OT, kits de herramientas y asignaciones de campo. */
const FIELD_ASSIGNEE_ROLE_KEYS = ['ing_campo', 'ing_soporte'] as const;

/** Pueden asignar a cualquier ingeniero de campo (no solo reportes directos). */
const BROAD_FIELD_ASSIGN_SCOPE = new Set(['ceo', 'dir_operaciones', 'arquitecto', 'super_admin']);

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
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

  /** Users belonging to the active tenant via UserCompany. */
  private companyMembershipFilter(companyId: number): Prisma.UserWhereInput {
    return { companyMemberships: { some: { companyId } } };
  }

  /**
   * Fail-closed IDOR guard: user must belong to the active company.
   * Super-admin exemption only when `isSuperAdmin` is explicitly true
   * (prefer still requiring membership for normal admin ops).
   */
  async assertUserInCompany(
    userId: number,
    companyId: number | null | undefined,
    opts?: { isSuperAdmin?: boolean },
  ): Promise<{ id: number }> {
    if (opts?.isSuperAdmin === true) {
      const user = await this.prisma.user.findFirst({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) throw new NotFoundException('Usuario no encontrado');
      return user;
    }
    const tenantId = requireCompanyId(companyId);
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        companyMemberships: { some: { companyId: tenantId } },
      },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  private async resolveEmployeeNumber(
    employeeNumber: string | undefined,
    fallbackId: number,
    excludeUserId?: number,
    companyId?: number | null,
    opts?: { tx?: Prisma.TransactionClient; skipClear?: boolean },
  ) {
    const normalized = this.normalizeEmployeeNumber(employeeNumber) || this.formatEmployeeNumberFromId(fallbackId);

    if (!opts?.skipClear) {
      await this.clearEmployeeNumberForProtectedUsers();
    }

    const db = opts?.tx ?? this.prisma;
    const tenantId =
      companyId != null && Number.isFinite(Number(companyId)) && Number(companyId) > 0
        ? Number(companyId)
        : null;

    // Prefer tenant-local uniqueness via UserCompany.(companyId, employeeNumber).
    if (tenantId != null) {
      const peerMembership = await db.userCompany.findFirst({
        where: {
          companyId: tenantId,
          employeeNumber: normalized,
          ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
        },
        select: {
          user: { select: { id: true, email: true, nombre: true } },
        },
      });

      if (peerMembership?.user) {
        const existing = peerMembership.user;
        if (this.isProtectedSuperAdminEmail(existing.email)) {
          throw new ConflictException('El numero de empleado ya existe (reservado por un usuario protegido no visible en la lista)');
        }
        throw new ConflictException(`El numero de empleado ya existe (usuario: ${existing.nombre || existing.email})`);
      }

      return normalized;
    }

    // No company scope: fall back to global User.employeeNumber (compat).
    const existing = await db.user.findFirst({
      where: {
        employeeNumber: normalized,
        email: { notIn: this.superAdminEmails },
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true, email: true, nombre: true },
    });

    if (existing) {
      if (this.isProtectedSuperAdminEmail(existing.email)) {
        throw new ConflictException('El numero de empleado ya existe (reservado por un usuario protegido no visible en la lista)');
      }

      throw new ConflictException(`El numero de empleado ya existe (usuario: ${existing.nombre || existing.email})`);
    }

    return normalized;
  }

  /** Extract a sortable sequence from an employee number (prefix suffix or digits). */
  private employeeNumberSequence(value?: string | null): number {
    const normalized = this.normalizeEmployeeNumber(value);
    if (!normalized) return 0;
    if (normalized.startsWith(this.employeeNumberPrefix)) {
      return Number.parseInt(normalized.slice(this.employeeNumberPrefix.length).replace(/\D+/g, ''), 10) || 0;
    }
    const digits = normalized.replace(/\D+/g, '');
    return digits ? Number.parseInt(digits, 10) || 0 : 0;
  }

  private mapUserUniqueConstraintError(e: Prisma.PrismaClientKnownRequestError): BadRequestException | null {
    if (e.code !== 'P2002') return null;
    const raw = e.meta?.target as string | string[] | undefined;
    const parts = Array.isArray(raw) ? raw : raw != null ? [String(raw)] : [];
    const joined = parts.join(' ').toLowerCase();
    if (joined.includes('email')) {
      return new BadRequestException('Este correo electrónico ya está registrado.');
    }
    if (joined.includes('employeenumber') || joined.includes('employee_number')) {
      // Race on UserCompany @@unique([companyId, employeeNumber]).
      return new BadRequestException('Número de empleado ya en uso en esta empresa');
    }
    return new BadRequestException('Ya existe un registro duplicado; revisa el correo o el número de empleado.');
  }

  async getNextEmployeeNumber(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const memberships = await this.prisma.userCompany.findMany({
      where: { companyId: tenantId, employeeNumber: { not: null } },
      select: { employeeNumber: true },
    });

    let maxSeq = 0;
    for (const row of memberships) {
      const seq = this.employeeNumberSequence(row.employeeNumber);
      if (seq > maxSeq) maxSeq = seq;
    }

    if (maxSeq > 0) {
      return this.formatEmployeeNumberFromId(maxSeq + 1);
    }

    // Fallback when no tenant-local numbers yet: derive from membership user ids.
    const lastUser = await this.prisma['user'].findFirst({
      where: this.companyMembershipFilter(tenantId),
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

  /** Lista de usuarios visible (lectura) — incluye RRHH/coordinación sin permiso de edición. */
  private canViewUsersDirectory(currentUser: { permissions?: string[]; isSuperAdmin?: boolean }) {
    if (this.canManageUsers(currentUser)) return true;
    return Boolean(
      currentUser.permissions?.includes(PERMISSIONS.HR_VIEW) ||
      currentUser.permissions?.includes(PERMISSIONS.HR_MANAGE),
    );
  }

  private isProtectedSuperAdminEmail(email?: string | null) {
    const normalized = String(email || '').toLowerCase();
    return this.superAdminEmails.includes(normalized);
  }

  async findAllVisible(
    currentUser: { id: number; departmentId: number; permissions?: string[]; isSuperAdmin?: boolean },
    query?: PaginationQueryDto,
    companyId?: number | null,
  ) {
    // Implementation moved below with IAM enrichment (risk, sessions).
    return this.findAllVisibleIam(currentUser, query, companyId);
  }

  /** Plantilla RRHH — lista todos los usuarios activos con campos HR */
  async findHrStaff(
    currentUser: { id: number; isSuperAdmin?: boolean; permissions?: string[] },
    query?: PaginationQueryDto,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const where: Prisma.UserWhereInput = {
      AND: [
        this.companyMembershipFilter(tenantId),
        { NOT: { email: { in: this.superAdminEmails } } },
      ],
    };
    const select = {
      id: true, nombre: true, email: true, employeeNumber: true,
      avatarUrl: true, fechaCreacion: true,
      puesto: true, tipoContrato: true, estadoRRHH: true, isActive: true, fechaIngreso: true,
      department: { select: { id: true, nombre: true } },
      role: { select: { id: true, nombre: true, nivelAutoridad: true } },
    };

    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma['user'].findMany({ where, select, skip: query.skip, take: query.take, orderBy: { id: 'asc' } }),
        this.prisma['user'].count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma['user'].findMany({ where, select, orderBy: { id: 'asc' } });
  }

  /** Actualiza campos RRHH de un usuario */
  async updateHrFields(
    id: number,
    body: { puesto?: string; tipoContrato?: string; estadoRRHH?: string; isActive?: boolean; fechaIngreso?: string },
    companyId?: number | null,
  ) {
    await this.assertUserInCompany(id, companyId);
    const data: any = {};
    if (body.puesto !== undefined) data.puesto = body.puesto.trim() || null;
    if (body.tipoContrato !== undefined) data.tipoContrato = body.tipoContrato || null;
    if (body.estadoRRHH !== undefined) data.estadoRRHH = body.estadoRRHH;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.fechaIngreso !== undefined) data.fechaIngreso = body.fechaIngreso ? new Date(body.fechaIngreso) : null;
    const updated = await this.prisma['user'].update({ where: { id }, data });
    if (body.isActive === false) {
      await this.chat.removeUserMemberships(id);
    } else if (body.isActive === true) {
      await this.chat.addUserToOrgChannels(id);
    }
    if (body.isActive !== undefined || body.puesto !== undefined) {
      const acsPush = await this.pushAcsFromErp({
        companyId,
        employeeNumber: updated.employeeNumber,
        name: updated.nombre,
        enable: updated.isActive !== false,
      });
      return acsPush ? { ...updated, acsPush } : updated;
    }
    return updated;
  }

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatService))
    private readonly chat: ChatService,
    private readonly acsFanout: IntegraAcsFanoutService,
  ) {}

  /**
   * Push en vivo a ACS si hay sitio ISAPI.
   * Clave: employeeNumber ↔ employeeNo del terminal (sibling identity-unification).
   */
  private async pushAcsFromErp(opts: {
    companyId: number | null | undefined;
    employeeNumber?: string | null;
    name: string;
    enable: boolean;
  }) {
    if (opts.companyId == null || !opts.employeeNumber) return undefined;
    try {
      const acsPush = await this.acsFanout.pushErpUser({
        companyId: opts.companyId,
        employeeNo: opts.employeeNumber,
        name: opts.name,
        enable: opts.enable,
        createIfMissing: opts.enable,
      });
      if (!acsPush.skipped) {
        const bad = acsPush.sites.flatMap((s) => s.results.filter((r) => !r.ok));
        if (bad.length) {
          this.logger.warn(
            `ERP→ACS ${opts.employeeNumber}: ${bad.map((b) => `${b.deviceIp}=${b.error}`).join('; ')}`,
          );
        }
      }
      return acsPush;
    } catch (e) {
      this.logger.warn(`ERP→ACS push falló: ${e instanceof Error ? e.message : String(e)}`);
      return {
        skipped: true,
        reason: e instanceof Error ? e.message : String(e),
        sites: [],
      };
    }
  }

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

  private async resolveDepartmentId(value: unknown, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number' && Number.isFinite(value)) {
      const dept = await this.prisma.department.findFirst({
        where: { id: value, ...companyWhere(tenantId) },
        select: { id: true },
      });
      if (!dept) throw new BadRequestException('Departamento inválido para esta empresa');
      return dept.id;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        const dept = await this.prisma.department.findFirst({
          where: { id: parsed, ...companyWhere(tenantId) },
          select: { id: true },
        });
        if (!dept) throw new BadRequestException('Departamento inválido para esta empresa');
        return dept.id;
      }
      const department = await this.prisma.department.upsert({
        where: { companyId_nombre: { companyId: tenantId, nombre: trimmed } },
        update: {},
        create: { nombre: trimmed, companyId: tenantId },
        select: { id: true },
      });
      if (department?.id) return department.id;
    }
    throw new BadRequestException('Departamento inválido');
  }

  private async resolveManagerId(
    value: unknown,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
    companyId?: number | null,
  ): Promise<number | null> {
    if (value === null) return null;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      if (companyId != null && Number.isFinite(Number(companyId)) && Number(companyId) > 0) {
        const member = await tx.user.findFirst({
          where: {
            id: value,
            companyMemberships: { some: { companyId: Number(companyId) } },
          },
          select: { id: true },
        });
        if (!member) throw new BadRequestException('Manager no pertenece a la empresa activa');
      }
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        const parsed = Number(trimmed);
        if (Number.isFinite(parsed) && parsed > 0) {
          return this.resolveManagerId(parsed, tx, companyId);
        }
      }
    } else if (value !== undefined) {
      return null;
    }

    const ceoWhere: any = {
      email: { equals: 'gerencia@nexara.com.mx', mode: 'insensitive' },
    };
    if (companyId != null && Number.isFinite(Number(companyId)) && Number(companyId) > 0) {
      ceoWhere.companyMemberships = { some: { companyId: Number(companyId) } };
    }
    const ceo = await tx.user.findFirst({
      where: ceoWhere,
      select: { id: true },
    });
    return ceo?.id ?? null;
  }

  async create(createUserDto: CreateUserDto, companyId?: number | null) {
    await this.clearEmployeeNumberForProtectedUsers();
    const tenantId = requireCompanyId(companyId);

    // Seat limit del tenant activo (billing SaaS)
    const company = await this.prisma.companyProfile.findFirst({
      where: { id: tenantId, isActive: true },
      select: { id: true, seatLimit: true, billingStatus: true },
    });
    if (company) {
      if (company.billingStatus === 'suspended') {
        throw new BadRequestException('Empresa suspendida por billing — no se pueden crear usuarios');
      }
      const seatsUsed = await this.prisma.userCompany.count({
        where: { companyId: company.id, user: { isActive: true } },
      });
      if (seatsUsed >= company.seatLimit) {
        throw new BadRequestException(
          `Límite de asientos alcanzado (${seatsUsed}/${company.seatLimit}). Amplía el plan en Billing.`,
        );
      }
    }

    const hash = await bcrypt.hash(createUserDto.password, 10);
    const roleId = await this.resolveRoleId(createUserDto.roleId);
    const departmentId = await this.resolveDepartmentId(createUserDto.departmentId, tenantId);
    if (!departmentId) throw new BadRequestException('Departamento requerido');
    const emailNorm = createUserDto.email.trim().toLowerCase();

    const emailDup = await this.prisma.user.findFirst({
      where: { email: { equals: emailNorm, mode: 'insensitive' } },
      select: { id: true, nombre: true, email: true },
    });
    if (emailDup) {
      throw new BadRequestException(`El correo ya está registrado (${emailDup.nombre || emailDup.email}).`);
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const dupInTx = await tx.user.findFirst({
          where: { email: { equals: emailNorm, mode: 'insensitive' } },
          select: { id: true },
        });
        if (dupInTx) {
          throw new BadRequestException('El correo ya está registrado.');
        }

        const createdUser = await tx.user.create({
          data: {
            nombre: createUserDto.nombre,
            email: emailNorm,
            roleId,
            departmentId,
            avatarUrl: createUserDto.avatarUrl,
            passwordHash: hash,
            passwordChangedAt: new Date(),
            managerId: await this.resolveManagerId(createUserDto.managerId, tx, tenantId),
          },
        });

        const isProtected = this.isProtectedSuperAdminEmail(createdUser.email);
        const employeeNumber = isProtected
          ? null
          : await this.resolveEmployeeNumber(
              createUserDto.employeeNumber,
              createdUser.id,
              createdUser.id,
              tenantId,
              { tx, skipClear: true },
            );

        const existingMemberships = await tx.userCompany.count({
          where: { userId: createdUser.id },
        });
        await tx.userCompany.upsert({
          where: { userId_companyId: { userId: createdUser.id, companyId: tenantId } },
          update: { employeeNumber },
          create: {
            userId: createdUser.id,
            companyId: tenantId,
            isDefault: existingMemberships === 0,
            employeeNumber,
          },
        });

        if (isProtected) {
          return this.withEmployeeNumber(createdUser);
        }

        const updatedUser = await tx.user.update({
          where: { id: createdUser.id },
          data: { employeeNumber },
        });
        return this.withEmployeeNumber(updatedUser);
      });
      await this.chat.addUserToOrgChannels(created.id);
      const acsPush = await this.pushAcsFromErp({
        companyId: tenantId,
        employeeNumber: created.employeeNumber,
        name: created.nombre,
        enable: true,
      });
      return acsPush ? { ...created, acsPush } : created;
    } catch (e) {
      if (e instanceof BadRequestException || e instanceof ConflictException) throw e;
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        const mapped = this.mapUserUniqueConstraintError(e);
        if (mapped) throw mapped;
      }
      throw e;
    }
  }


  async findAll(query?: PaginationQueryDto, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const membership = this.companyMembershipFilter(tenantId);
    const include = { role: true, department: true };
    if (query?.limit) {
      const searchWhere = query.search
        ? {
            OR: [
              { nombre: { contains: query.search, mode: 'insensitive' as const } },
              { email: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : undefined;
      const where: Prisma.UserWhereInput = searchWhere
        ? { AND: [membership, searchWhere] }
        : membership;
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
      where: membership,
      include,
    });
    return this.withEmployeeNumberList(users);
  }

  async findAssignableUsers(
    currentUser: { id: number; departmentId: number; permissions?: string[]; isSuperAdmin?: boolean; role?: any },
    companyId?: number | null,
  ) {
    try {
      const tenantId = requireCompanyId(companyId);
      const membership = this.companyMembershipFilter(tenantId);
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
              membership,
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
      const hasActivitiesManagePermission = Boolean(currentUser.permissions?.includes(PERMISSIONS.ACTIVITIES_MANAGE));
      // Fallback por rol para compatibilidad con cuentas antiguas
      const isConsoleAdminByRole = userInDb.role?.accesoConsoleAdmin === true;
      const canAssignByHierarchy = hasConsoleAdminPermission || hasUsersManagePermission || isConsoleAdminByRole;

      if (canAssignByHierarchy) {
        // Admin/supervisor de consola puede asignar a cualquier usuario operativo (incluye otros admins), excepto superadmins de plataforma
        return this.prisma['user'].findMany({
          where: {
            AND: [
              membership,
              { id: { not: currentUser.id } },
              { email: { notIn: superAdminEmails } },
            ],
          },
          select: { id: true, nombre: true, email: true, role: true, avatarUrl: true },
          orderBy: { nombre: 'asc' },
        });
      }

      if (hasActivitiesManagePermission) {
        // OPS manager: asigna a ingenieros de campo bajo su jerarquía (organigrama NEXARA).
        const assignerRoleKey = String(userInDb.roleKey || userInDb.role?.orgRoleKey || '').toLowerCase();
        const fieldAssigneeFilter: Prisma.UserWhereInput[] = [
          membership,
          { isActive: true },
          { email: { notIn: superAdminEmails } },
          { roleKey: { in: [...FIELD_ASSIGNEE_ROLE_KEYS] } },
        ];

        if (!BROAD_FIELD_ASSIGN_SCOPE.has(assignerRoleKey)) {
          fieldAssigneeFilter.push({ managerId: currentUser.id });
        }

        return this.prisma['user'].findMany({
          where: { AND: fieldAssigneeFilter },
          select: { id: true, nombre: true, email: true, role: true, avatarUrl: true },
          orderBy: { nombre: 'asc' },
        });
      }

      // Usuario normal sin permisos: retorna vacío
      return [];
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      console.error('Error finding assignable users:', error);
      return [];
    }
  }

  /** Cuentas que no deben aparecer en la página pública "Nosotros / equipo" (ej. solo panel ventas). */
  private readonly excludedPublicTeamEmails = [
    'vendedor@nexara.com.mx',
    // Cuentas internas: existen en el ERP pero no forman parte del equipo que se
    // muestra en el sitio público. OJO: es el email, no el nombre — renombrar al
    // usuario desde RRHH no debe devolverlo a la web.
    'claudia.bernal@nexara.com.mx',
    'direccion.operaciones@nexara.com.mx',
    'soluciones@nexara.com.mx',
    ...this.superAdminEmails,
  ];

  /** Public site company: PUBLIC_COMPANY_ID > explicit X-Company-Id > isPrimary. Never all tenants. */
  private async resolvePublicTeamCompanyId(explicit?: number | null): Promise<number> {
    const fromEnv = Number(process.env.PUBLIC_COMPANY_ID);
    if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
    if (explicit != null && Number.isFinite(Number(explicit)) && Number(explicit) > 0) {
      return requireCompanyId(explicit);
    }
    const primary = await withTenantBypassAsync(() =>
      this.prisma.companyProfile.findFirst({
        where: { isPrimary: true, isActive: true },
        select: { id: true },
        orderBy: { id: 'asc' },
      }),
    );
    if (!primary?.id) {
      throw new ForbiddenException('No hay empresa configurada para contenido público');
    }
    return primary.id;
  }

  async findPublicTeam(limit = 12, companyId?: number | null) {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(24, Math.trunc(limit))) : 12;
    const tenantId = await this.resolvePublicTeamCompanyId(companyId);
    return this.prisma['user'].findMany({
      where: {
        email: { notIn: this.excludedPublicTeamEmails },
        companyMemberships: { some: { companyId: tenantId } },
      },
      select: {
        id: true,
        nombre: true,
        avatarUrl: true,
        role: { select: { nombre: true } },
      },
      orderBy: [{ fechaCreacion: 'desc' }, { id: 'desc' }],
      take: safeLimit,
    });
  }

  findByDepartment(departmentId: number) {
    return this.prisma['user'].findMany({
      where: { departmentId },
      include: { role: true, department: true },
    });
  }

  listRolesForPicker() {
    return this.prisma['role'].findMany({
      select: { id: true, nombre: true, orgRoleKey: true, nivelAutoridad: true },
      orderBy: [{ nivelAutoridad: 'desc' }, { nombre: 'asc' }],
    });
  }

  listDepartments(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    return this.prisma.department.findMany({
      where: companyWhere(tenantId),
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    });
  }

  /** Actividades visibles para CONSOLE_ADMIN: todo el personal excepto cuentas de plataforma. */
  findUsersForConsoleActivityScope() {
    return this.prisma['user'].findMany({
      where: {
        email: { notIn: this.superAdminEmails },
      },
      select: { id: true },
    });
  }

  async findOne(id: number, companyId?: number | null, opts?: { isSuperAdmin?: boolean }) {
    await this.assertUserInCompany(id, companyId, opts);
    return this.prisma['user'].findUnique({
      where: { id },
      include: { role: true, department: true },
    }).then((user) => (user ? this.withEmployeeNumber(user) : user));
  }

  async getProfile(userId: number, companyId?: number | null) {
    if (companyId !== undefined) {
      await this.assertUserInCompany(userId, companyId);
    }
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

  async updateProfileReview(userId: number, data: any, companyId?: number | null) {
    await this.assertUserInCompany(userId, companyId);
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

  async update(id: number, updateUserDto: UpdateUserDto, companyId?: number | null) {
    await this.assertUserInCompany(id, companyId);
    await this.clearEmployeeNumberForProtectedUsers();

    const data: any = { ...updateUserDto };
    // roleKey sólo se cambia desde el endpoint dedicado PATCH /users/:id/role-key
    delete data.roleKey;
    const currentUser = await this.prisma['user'].findUnique({
      where: { id },
      select: { email: true },
    });

    const nextEmail = data.email !== undefined ? String(data.email || '') : String(currentUser?.email || '');
    const isProtectedUser = this.isProtectedSuperAdminEmail(nextEmail);

    if (data.password) {
      data.passwordHash = await bcrypt.hash(data.password, 10);
      data.passwordChangedAt = new Date();
      delete data.password;
    }
    if (data.roleId !== undefined) {
      data.roleId = await this.resolveRoleId(data.roleId);
    }
    if (data.departmentId !== undefined) {
      data.departmentId = await this.resolveDepartmentId(data.departmentId, companyId);
    }
    if (data.managerId !== undefined) {
      data.managerId = await this.resolveManagerId(data.managerId, this.prisma, companyId);
    }
    const syncMembershipEmployeeNumber =
      isProtectedUser || updateUserDto.employeeNumber !== undefined;

    if (isProtectedUser) {
      data.employeeNumber = null;
    } else if (data.employeeNumber !== undefined) {
      data.employeeNumber = await this.resolveEmployeeNumber(data.employeeNumber, id, id, companyId);
    }
    if (data.avatarUrl !== undefined) {
      const normalizedAvatar = String(data.avatarUrl ?? '').trim();
      data.avatarUrl = normalizedAvatar ? normalizedAvatar : null;
    }

    try {
      const before = await this.prisma['user'].findUnique({
        where: { id },
        select: { nombre: true, employeeNumber: true, isActive: true },
      });
      const user = await this.prisma['user'].update({
        where: { id },
        data,
      });

      if (syncMembershipEmployeeNumber && companyId != null) {
        const tenantId = requireCompanyId(companyId);
        await this.prisma.userCompany.updateMany({
          where: { userId: id, companyId: tenantId },
          data: { employeeNumber: data.employeeNumber ?? null },
        });
      }

      const enriched = this.withEmployeeNumber(user);
      const shouldPushAcs =
        updateUserDto.nombre !== undefined ||
        updateUserDto.employeeNumber !== undefined ||
        updateUserDto.isActive !== undefined ||
        (before &&
          (before.nombre !== user.nombre ||
            before.employeeNumber !== user.employeeNumber ||
            before.isActive !== user.isActive));

      if (shouldPushAcs) {
        const acsPush = await this.pushAcsFromErp({
          companyId,
          employeeNumber: enriched.employeeNumber,
          name: enriched.nombre,
          enable: enriched.isActive !== false,
        });
        return acsPush ? { ...enriched, acsPush } : enriched;
      }

      return enriched;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        const mapped = this.mapUserUniqueConstraintError(e);
        if (mapped) throw mapped;
      }
      throw e;
    }
  }

  async remove(id: number, companyId?: number | null) {
    await this.assertUserInCompany(id, companyId);
    return this.prisma['user'].delete({ where: { id } });
  }

 
  async setManager(userId: number, managerId: number | null, companyId?: number | null) {
    await this.assertUserInCompany(userId, companyId);
    if (managerId != null) {
      await this.assertUserInCompany(managerId, companyId);
    }
    return this.prisma['user'].update({
      where: { id: userId },
      data: { managerId: managerId ?? null },
      select: { id: true, nombre: true, managerId: true },
    });
  }

  async getOrgchart(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const users = await this.prisma['user'].findMany({
      where: {
        isActive: true,
        email: { notIn: this.superAdminEmails },
        ...this.companyMembershipFilter(tenantId),
      },
      select: {
        id: true,
        nombre: true,
        managerId: true,
        avatarUrl: true,
        role: { select: { id: true, nombre: true } },
        department: { select: { id: true, nombre: true } },
      },
      orderBy: { nombre: 'asc' },
    });

    type OrgNode = (typeof users)[number] & { children: OrgNode[] };
    const map = new Map<number, OrgNode>();
    for (const u of users) map.set(u.id, { ...u, children: [] });

    const roots: OrgNode[] = [];
    for (const node of map.values()) {
      if (node.managerId && map.has(node.managerId)) {
        map.get(node.managerId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  /** Score de riesgo 0–100 para un usuario (IAM). */
  computeRiskScore(u: {
    isActive?: boolean | null;
    lastLoginAt?: Date | null;
    failedLoginCount?: number | null;
    lockedUntil?: Date | null;
    managerId?: number | null;
    mfaEnabled?: boolean | null;
    passwordChangedAt?: Date | null;
    fechaCreacion?: Date | null;
  }): { score: number; factors: string[] } {
    const factors: string[] = [];
    let score = 0;
    const now = Date.now();
    const day = 86_400_000;

    if (u.isActive === false) {
      return { score: 100, factors: ['Cuenta desactivada'] };
    }
    if (u.lockedUntil && u.lockedUntil.getTime() > now) {
      score += 40;
      factors.push('Cuenta bloqueada por intentos fallidos');
    }
    if (!u.lastLoginAt) {
      score += 30;
      factors.push('Nunca ha iniciado sesión');
    } else {
      const idleDays = (now - u.lastLoginAt.getTime()) / day;
      if (idleDays >= 60) {
        score += 35;
        factors.push(`Inactivo ${Math.floor(idleDays)} días`);
      } else if (idleDays >= 30) {
        score += 25;
        factors.push(`Sin acceso ${Math.floor(idleDays)} días`);
      } else if (idleDays >= 14) {
        score += 12;
        factors.push(`Último acceso hace ${Math.floor(idleDays)} días`);
      }
    }
    const fails = u.failedLoginCount ?? 0;
    if (fails > 0) {
      const add = Math.min(30, fails * 8);
      score += add;
      factors.push(`${fails} intento(s) fallido(s) reciente(s)`);
    }
    if (!u.mfaEnabled) {
      score += 8;
      factors.push('MFA desactivado');
    }
    if (!u.managerId) {
      score += 5;
      factors.push('Sin manager asignado');
    }
    if (u.passwordChangedAt) {
      const pwdAge = (now - u.passwordChangedAt.getTime()) / day;
      if (pwdAge >= 180) {
        score += 15;
        factors.push('Contraseña con más de 6 meses');
      }
    } else if (u.fechaCreacion) {
      const age = (now - u.fechaCreacion.getTime()) / day;
      if (age >= 90) {
        score += 10;
        factors.push('Sin cambio de contraseña registrado');
      }
    }

    return { score: Math.min(100, score), factors };
  }

  private enrichIamUser<T extends {
    id: number;
    isActive?: boolean | null;
    lastLoginAt?: Date | null;
    failedLoginCount?: number | null;
    lockedUntil?: Date | null;
    managerId?: number | null;
    mfaEnabled?: boolean | null;
    passwordChangedAt?: Date | null;
    fechaCreacion?: Date | null;
  }>(user: T) {
    const risk = this.computeRiskScore(user);
    return {
      ...this.withEmployeeNumber(user as T & { email?: string | null; employeeNumber?: string | null }),
      riskScore: risk.score,
      riskLevel: risk.score >= 70 ? 'high' : risk.score >= 40 ? 'medium' : 'low',
      riskFactors: risk.factors,
    };
  }

  private async findAllVisibleIam(
    currentUser: { id: number; departmentId: number; permissions?: string[]; isSuperAdmin?: boolean },
    query?: PaginationQueryDto,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const membership = this.companyMembershipFilter(tenantId);
    const excludeSuperAdmins: Prisma.UserWhereInput = {
      NOT: { email: { in: this.superAdminEmails } },
    };
    const include = {
      role: true,
      department: true,
      manager: { select: { id: true, nombre: true } },
      _count: { select: { sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } },
    };

    let where: Prisma.UserWhereInput;
    if (currentUser.isSuperAdmin) {
      where = { AND: [membership, excludeSuperAdmins] };
    } else if (this.canViewUsersDirectory(currentUser)) {
      where = { AND: [membership, { role: { accesoConsoleAdmin: false } }, excludeSuperAdmins] };
    } else {
      where = { AND: [membership, { id: currentUser.id }, excludeSuperAdmins] };
    }

    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma['user'].findMany({ where, include, skip: query.skip, take: query.take }),
        this.prisma['user'].count({ where }),
      ]);
      const paginated = buildPaginatedResponse(data, total, query);
      return {
        ...paginated,
        data: (paginated.data || []).map((u: any) => ({
          ...this.enrichIamUser(u),
          activeSessions: u._count?.sessions ?? 0,
        })),
      };
    }
    const users = await this.prisma['user'].findMany({ where, include });
    return users.map((u: any) => ({
      ...this.enrichIamUser(u),
      activeSessions: u._count?.sessions ?? 0,
    }));
  }

  /** Dashboard IAM: KPIs, tendencias, rankings de riesgo. */
  async getIamInsights(
    currentUser: { isSuperAdmin?: boolean; permissions?: string[] },
    companyId?: number | null,
  ) {
    if (!this.canViewUsersDirectory(currentUser)) {
      throw new ForbiddenException('Sin permiso para ver insights IAM');
    }

    const tenantId = requireCompanyId(companyId);
    const exclude: Prisma.UserWhereInput = {
      AND: [
        this.companyMembershipFilter(tenantId),
        { email: { notIn: this.superAdminEmails } },
      ],
    };
    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 86_400_000);
    const d30 = new Date(now.getTime() - 30 * 86_400_000);
    const d90 = new Date(now.getTime() - 90 * 86_400_000);

    const users = await this.prisma.user.findMany({
      where: exclude,
      select: {
        id: true,
        nombre: true,
        email: true,
        isActive: true,
        lastLoginAt: true,
        lastLoginDevice: true,
        failedLoginCount: true,
        lockedUntil: true,
        mfaEnabled: true,
        managerId: true,
        passwordChangedAt: true,
        fechaCreacion: true,
        role: { select: { id: true, nombre: true } },
        department: { select: { id: true, nombre: true } },
      },
    });

    const enriched = users.map((u) => this.enrichIamUser(u));
    const active = enriched.filter((u) => u.isActive);
    const inactive = enriched.filter((u) => !u.isActive);
    const neverLogin = enriched.filter((u) => u.isActive && !u.lastLoginAt);
    const active7 = enriched.filter((u) => u.lastLoginAt && u.lastLoginAt >= d7);
    const active30 = enriched.filter((u) => u.lastLoginAt && u.lastLoginAt >= d30);
    const stale30 = enriched.filter(
      (u) => u.isActive && u.lastLoginAt && u.lastLoginAt < d30,
    );
    const locked = enriched.filter((u) => u.lockedUntil && u.lockedUntil > now);
    const highRisk = enriched.filter((u) => u.riskLevel === 'high');
    const created7 = enriched.filter((u) => u.fechaCreacion && u.fechaCreacion >= d7);
    const created30 = enriched.filter((u) => u.fechaCreacion && u.fechaCreacion >= d30);
    const mfaOn = enriched.filter((u) => u.mfaEnabled);

    const byDept: Record<string, number> = {};
    const byRole: Record<string, number> = {};
    const byDevice: Record<string, number> = {};
    for (const u of enriched) {
      const dept = (u as any).department?.nombre ?? 'Sin depto.';
      const role = (u as any).role?.nombre ?? 'Sin rol';
      byDept[dept] = (byDept[dept] ?? 0) + 1;
      byRole[role] = (byRole[role] ?? 0) + 1;
      if (u.lastLoginDevice) {
        byDevice[u.lastLoginDevice] = (byDevice[u.lastLoginDevice] ?? 0) + 1;
      }
    }

    const auditSince = d90;
    const loginEvents = await this.prisma.auditLog.findMany({
      where: {
        entityType: 'Auth',
        action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED'] },
        createdAt: { gte: auditSince },
      },
      select: { action: true, createdAt: true, userId: true },
      orderBy: { createdAt: 'asc' },
    });

    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const successByDay: Record<string, number> = {};
    const failedByDay: Record<string, number> = {};
    const hourBuckets = Array.from({ length: 24 }, () => 0);
    for (let i = 13; i >= 0; i--) {
      const k = dayKey(new Date(now.getTime() - i * 86_400_000));
      successByDay[k] = 0;
      failedByDay[k] = 0;
    }
    for (const ev of loginEvents) {
      const k = dayKey(ev.createdAt);
      if (ev.action === 'LOGIN_SUCCESS') {
        if (k in successByDay) successByDay[k] += 1;
        hourBuckets[ev.createdAt.getHours()] += 1;
      } else if (k in failedByDay) {
        failedByDay[k] += 1;
      }
    }

    const activeSessions = await this.prisma.userSession.count({
      where: { revokedAt: null, expiresAt: { gt: now } },
    });

    const riskTop = [...enriched]
      .filter((u) => u.isActive)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10)
      .map((u) => ({
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        riskScore: u.riskScore,
        riskLevel: u.riskLevel,
        riskFactors: u.riskFactors,
        lastLoginAt: u.lastLoginAt,
        failedLoginCount: u.failedLoginCount,
      }));

    return {
      generatedAt: now.toISOString(),
      kpis: {
        total: enriched.length,
        active: active.length,
        inactive: inactive.length,
        neverLoggedIn: neverLogin.length,
        activeLast7d: active7.length,
        activeLast30d: active30.length,
        stale30d: stale30.length,
        locked: locked.length,
        highRisk: highRisk.length,
        createdLast7d: created7.length,
        createdLast30d: created30.length,
        mfaEnabled: mfaOn.length,
        mfaCoveragePct: enriched.length
          ? Math.round((mfaOn.length / enriched.length) * 1000) / 10
          : 0,
        activeSessions,
        retentionProxy30d: active.length
          ? Math.round((active30.length / active.length) * 1000) / 10
          : 0,
      },
      distributions: {
        byDepartment: Object.entries(byDept)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
        byRole: Object.entries(byRole)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 12),
        byDevice: Object.entries(byDevice)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
      },
      trends: {
        loginsSuccess14d: Object.entries(successByDay).map(([date, count]) => ({ date, count })),
        loginsFailed14d: Object.entries(failedByDay).map(([date, count]) => ({ date, count })),
        peakHours: hourBuckets.map((count, hour) => ({ hour, count })),
      },
      riskTop,
      alerts: [
        ...(locked.length
          ? [{ severity: 'danger' as const, message: `${locked.length} cuenta(s) bloqueada(s) por force brute` }]
          : []),
        ...(neverLogin.length
          ? [{ severity: 'warning' as const, message: `${neverLogin.length} usuario(s) activo(s) sin primer login` }]
          : []),
        ...(stale30.length
          ? [{ severity: 'warning' as const, message: `${stale30.length} usuario(s) sin acceso en 30+ días` }]
          : []),
        ...(highRisk.length
          ? [{ severity: 'danger' as const, message: `${highRisk.length} usuario(s) en riesgo alto` }]
          : []),
      ],
    };
  }

  async listUserSessions(userId: number, companyId?: number | null) {
    await this.assertUserInCompany(userId, companyId);
    return this.prisma.userSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        device: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        revokedAt: true,
        revokeReason: true,
      },
    });
  }

  async revokeSession(sessionId: number, companyId?: number | null, reason = 'admin_revoke') {
    const session = await this.prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Sesión no encontrada');
    await this.assertUserInCompany(session.userId, companyId);
    if (session.revokedAt) return session;
    return this.prisma.userSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }

  async revokeAllUserSessions(userId: number, companyId?: number | null, reason = 'admin_force_logout') {
    await this.assertUserInCompany(userId, companyId);
    const result = await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    await this.prisma.auditLog.create({
      data: {
        entityType: 'User',
        entityId: userId,
        action: 'FORCE_LOGOUT',
        changes: { revoked: result.count, reason },
        userId,
      },
    }).catch(() => undefined);
    return { revoked: result.count };
  }

  async unlockUser(userId: number, companyId?: number | null) {
    await this.assertUserInCompany(userId, companyId);
    return this.prisma.user.update({
      where: { id: userId },
      data: { lockedUntil: null, failedLoginCount: 0 },
      select: { id: true, nombre: true, email: true, lockedUntil: true, failedLoginCount: true },
    });
  }

  async bulkSetActive(ids: number[], isActive: boolean, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const safeIds = ids.filter((id) => Number.isFinite(id) && id > 0);
    if (!safeIds.length) throw new BadRequestException('Sin IDs válidos');
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: safeIds },
        companyMemberships: { some: { companyId: tenantId } },
      },
      select: { id: true, email: true },
    });
    const allowed = users
      .filter((u) => !this.isProtectedSuperAdminEmail(u.email))
      .map((u) => u.id);
    const result = await this.prisma.user.updateMany({
      where: { id: { in: allowed } },
      data: { isActive },
    });
    if (!isActive) {
      await this.prisma.userSession.updateMany({
        where: { userId: { in: allowed }, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'bulk_deactivate' },
      });
    }
    return { updated: result.count, skipped: safeIds.length - allowed.length };
  }

  async getUserAuthActivity(userId: number, companyId?: number | null, limit = 40) {
    await this.assertUserInCompany(userId, companyId);
    return this.prisma.auditLog.findMany({
      where: {
        OR: [
          { userId, entityType: 'Auth' },
          { entityType: 'User', entityId: userId, action: { in: ['FORCE_LOGOUT', 'UNLOCK', 'PASSWORD_RESET'] } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
      select: {
        id: true,
        action: true,
        changes: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
      },
    });
  }

  async beginMfaSetup(userId: number) {
    const { generateMfaSecret, buildOtpAuthUrl } = await import('./mfa.util.js');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, mfaEnabled: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const secret = generateMfaSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret, mfaEnabled: false, mfaEnabledAt: null },
    });
    return {
      secret,
      otpauthUrl: buildOtpAuthUrl(secret, user.email),
      message: 'Escanea el QR en tu app autenticadora y confirma con un código.',
    };
  }

  async confirmMfaSetup(userId: number, token: string) {
    const { verifyTotp } = await import('./mfa.util.js');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaSecret: true },
    });
    if (!user?.mfaSecret) throw new BadRequestException('Inicia el setup MFA primero');
    if (!verifyTotp(user.mfaSecret, token)) {
      throw new BadRequestException('Código MFA inválido');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, mfaEnabledAt: new Date() },
    });
    return { mfaEnabled: true };
  }

  async disableMfa(userId: number, token?: string) {
    const { verifyTotp } = await import('./mfa.util.js');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaSecret: true, mfaEnabled: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (user.mfaEnabled && user.mfaSecret) {
      if (!token || !verifyTotp(user.mfaSecret, token)) {
        throw new BadRequestException('Código MFA requerido para desactivar');
      }
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null, mfaEnabledAt: null },
    });
    return { mfaEnabled: false };
  }

  async getMfaStatus(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, mfaEnabledAt: true },
    });
    return { mfaEnabled: Boolean(user?.mfaEnabled), mfaEnabledAt: user?.mfaEnabledAt ?? null };
  }
}
