import { Controller, Post, Body, Get, Param, Patch, Delete, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('roles')
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ROLES_MANAGE] })
  async create(@Body() createRoleDto: CreateRoleDto) {
    return this.prisma.role.create({ data: createRoleDto });
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
    return this.prisma.role.update({ where: { id: Number(id) }, data: updateRoleDto });
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ROLES_MANAGE] })
  async remove(@Param('id') id: string) {
    return this.prisma.role.delete({ where: { id: Number(id) } });
  }
}
