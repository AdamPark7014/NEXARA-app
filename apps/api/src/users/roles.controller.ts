import { BadRequestException, Controller, Post, Body, Get, Param, Patch, Delete, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

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
      throw new BadRequestException('Gestion CVs debe ser un rol no administrativo');
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
    const data = this.sanitizeRolePayload(createRoleDto);
    return this.prisma.role.create({ data });
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ROLES_MANAGE] })
  async findAll() {
    return this.prisma.role.findMany();
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
    return this.prisma.role.delete({ where: { id: Number(id) } });
  }
}
