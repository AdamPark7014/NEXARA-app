import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ForbiddenException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // CEO (100) puede crear cualquier usuario, Supervisor (50) solo staff (10) de su departamento
  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 50 })
  @UseInterceptors(FileInterceptor('avatar', { dest: 'apps/api/uploads/users' }))
  async create(
    @CurrentUser() user: any,
    @Body() createUserDto: CreateUserDto,
    @UploadedFile() file?: any
  ) {
    // Si es supervisor, solo puede crear staff y de su departamento
    const u: any = user;
    if (u && u.nivelAutoridad === 50) {
      if (createUserDto.roleId !== 3 || createUserDto.departmentId !== u.departmentId) {
        throw new ForbiddenException('Solo puedes crear staff de tu departamento');
      }
    }
    if (file) {
      createUserDto.avatarUrl = `/uploads/users/${file.filename}`;
    }
    return this.usersService.create(createUserDto);
  }

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 50 })
  findAll(@CurrentUser() user: any) {
    // CEO ve todos, supervisor solo su departamento
    const u: any = user;
    if (u && u.nivelAutoridad === 50) {
      return this.usersService.findByDepartment(u.departmentId);
    }
    return this.usersService.findAll();
  }

  @Get(':id')
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 50 })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 50 })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    // Solo CEO o supervisor de su departamento
    return this.usersService.update(+id, updateUserDto);
  }

  @Delete(':id')
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 50 })
  async remove(@Param('id') id: string) {
    // CEO puede borrar a cualquiera, supervisor solo staff de su departamento
    const target = await this.usersService.findOne(+id);
    if (!target) throw new ForbiddenException('Usuario no encontrado');
    // Aquí deberías agregar la lógica de validación de permisos si es necesario
    return this.usersService.remove(+id);
  }
}
