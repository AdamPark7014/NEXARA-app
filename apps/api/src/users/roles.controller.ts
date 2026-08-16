import { BadRequestException, ConflictException, Controller, Post, Body, Get, Param, Patch, Delete, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

import { ORG_ROLE_TEMPLATES } from '../common/org-roles.js';
import { buildRoleData, resolveTemplateOrThrow } from './role-template.js';
import { buildRoleAccessSummary } from './role-access-summary.js';

@Controller('roles')
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  private sanitizeRolePayload<T extends Record<string, any>>(payload: T): T {
    const normalized = { ...payload } as T & {
      accesoGestionCvs?: boolean;
      accesoConsoleAdmin?: boolean;
      accesoGestionUsuarios?: boolean;
      accesoGestionTienda?: boolean;
      accesoGestionWeb?: boolean;
      accesoContabilidad?: boolean;
      accesoConsole?: boolean;
    };

    const hasCvsAccess = normalized.accesoGestionCvs === true;
    const hasAdminFlags = Boolean(
      normalized.accesoConsoleAdmin ||
      normalized.accesoGestionUsuarios ||
      normalized.accesoGestionTienda ||
      normalized.accesoGestionWeb ||
      normalized.accesoContabilidad,
    );

    if (hasCvsAccess && hasAdminFlags) {
      throw new BadRequestException('Gestión CVs debe ser un rol no administrativo');
    }

    if (hasCvsAccess) {
      normalized.accesoConsole = true;
      normalized.accesoConsoleAdmin = false;
      normalized.accesoGestionUsuarios = false;
      normalized.accesoGestionTienda = false;
      normalized.accesoGestionWeb = false;
      normalized.accesoContabilidad = false;
    }

    return normalized as T;
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ROLES_MANAGE] })
  async create(@Body() createRoleDto: CreateRoleDto) {
    const sanitized = { ...this.sanitizeRolePayload(createRoleDto) };
    const name = String(sanitized.nombre || '').trim();
    if (!name) {
      throw new BadRequestException('Nombre de rol requerido');
    }
    sanitized.nombre = name;

    // Todo rol nace de una plantilla: sin `orgRoleKey` la matriz de permisos no
    // sabe qué puede hacer y el rol queda sin línea base.
    const template = resolveTemplateOrThrow(sanitized);
    const data = buildRoleData(template, sanitized) as Prisma.RoleUncheckedCreateInput;
    data.nombre = name;

    const existing = await this.prisma.role.findFirst({
      where: { nombre: { equals: name, mode: 'insensitive' } },
      select: { id: true, nombre: true },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe un rol llamado "${existing.nombre}". Asigna ese rol o elige otro nombre.`,
      );
    }

    try {
      return await this.prisma.role.create({ data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un rol con ese nombre.');
      }
      throw e;
    }
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.ROLES_MANAGE, PERMISSIONS.USERS_MANAGE, PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.HR_MANAGE] })
  async findAll() {
    return this.prisma.role.findMany();
  }

  @Get('org-templates')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.ROLES_MANAGE, PERMISSIONS.USERS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  listOrgTemplates() {
    return ORG_ROLE_TEMPLATES.map(({ orgRoleKey, nombre, label, description, nivelAutoridad, departmentHint, flags }) => ({
      orgRoleKey,
      nombre,
      label,
      description,
      nivelAutoridad,
      departmentHint,
      flags,
    }));
  }

  /**
   * Qué alcanza cada rol, resuelto contra la matriz de permisos.
   *
   * Hasta ahora el acceso de un rol estaba repartido entre sus banderas, su
   * plantilla, la matriz de URLs y la lista de permisos, sin ninguna vista que
   * lo juntara: no se podía saber qué haría un rol hasta que alguien chocaba
   * con un 403.
   */
  @Get('access-matrix')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.ROLES_MANAGE, PERMISSIONS.USERS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  async accessMatrix() {
    const roles = await this.prisma.role.findMany({
      select: { id: true, nombre: true, orgRoleKey: true, nivelAutoridad: true },
      orderBy: [{ nivelAutoridad: 'desc' }, { nombre: 'asc' }],
    });

    return roles.map((role) => ({
      id: role.id,
      nombre: role.nombre,
      orgRoleKey: role.orgRoleKey,
      nivelAutoridad: role.nivelAutoridad,
      acceso: buildRoleAccessSummary({ orgRoleKey: role.orgRoleKey }),
    }));
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ROLES_MANAGE] })
  async findOne(@Param('id') id: string) {
    return this.prisma.role.findUnique({ where: { id: Number(id) } });
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ROLES_MANAGE] })
  async update(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    const data = this.sanitizeRolePayload(updateRoleDto);
    return this.prisma.role.update({ where: { id: Number(id) }, data });
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ROLES_MANAGE] })
  async remove(@Param('id') id: string) {
    const roleId = Number(id);
    if (!Number.isInteger(roleId) || roleId <= 0) {
      throw new BadRequestException('Identificador de rol inválido');
    }

    // Borrar un rol con gente asignada dejaba a esos usuarios sin permisos
    // (o fallaba con un error de clave foránea sin explicar la causa).
    const assigned = await this.prisma.user.count({ where: { roleId } });
    if (assigned > 0) {
      throw new ConflictException(
        `No se puede eliminar: ${assigned} usuario(s) tienen este rol asignado. ` +
          'Reasígnalos a otro rol antes de borrarlo.',
      );
    }

    return this.prisma.role.delete({ where: { id: roleId } });
  }
}
