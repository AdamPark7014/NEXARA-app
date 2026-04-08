import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ForbiddenException, UploadedFile, UploadedFiles, UseInterceptors, BadRequestException, NotFoundException, Res, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { PERMISSIONS } from '../common/permissions.js';
import { getUsersUploadDir, getUserDocsUploadDir } from '../common/upload-paths.js';
import { createReadStream, existsSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Response } from 'express';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { diskStorage } from 'multer';
import * as fs from 'node:fs';

const buildAvatarUploadOptions = (dirname: string) => {
  const destination = getUsersUploadDir(dirname);
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }

  return {
    storage: diskStorage({
      destination: (_req, _file, cb) => cb(null, destination),
      filename: (_req, file, cb) => {
        const safeOriginal = String(file.originalname || '').replace(/\s+/g, '-').toLowerCase();
        const ext = safeOriginal.includes('.')
          ? safeOriginal.slice(safeOriginal.lastIndexOf('.'))
          : (file.mimetype === 'image/png'
              ? '.png'
              : file.mimetype === 'image/webp'
                ? '.webp'
                : '.jpg');
        const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
        cb(null, uniqueName);
      },
    }),
    fileFilter: (_req: any, file: any, cb: any) => {
      const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowed.includes(String(file.mimetype || '').toLowerCase())) {
        cb(new BadRequestException('Solo se permiten imagenes JPG, PNG o WEBP'), false);
        return;
      }
      cb(null, true);
    },
  };
};

@Controller('users')
export class UsersController {
  private readonly usersUploadDir = getUsersUploadDir(__dirname);
  private readonly userDocsUploadDir = getUserDocsUploadDir(__dirname);

  constructor(private readonly usersService: UsersService) {}

  // CEO (100) puede crear cualquier usuario, Supervisor (50) solo staff (10) de su departamento
  @Post()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.USERS_MANAGE] })
  @UseInterceptors(FileInterceptor('avatar', buildAvatarUploadOptions(__dirname)))
  async create(
    @CurrentUser() user: any,
    @Body() createUserDto: CreateUserDto,
    @UploadedFile() file?: any
  ) {
    const u: any = user;
    const targetRole = await this.usersService.getRoleById(createUserDto.roleId);
    if (!targetRole) throw new ForbiddenException('Rol destino no encontrado');

    const cvManagerWithAdminFlags = Boolean(
      targetRole.accesoGestionCvs &&
      (
        targetRole.accesoConsoleAdmin ||
        targetRole.accesoGestionUsuarios ||
        targetRole.accesoGestionTienda ||
        targetRole.accesoGestionWeb ||
        targetRole.accesoContabilidad
      ),
    );
    if (cvManagerWithAdminFlags) {
      throw new ForbiddenException('Rol inválido: Gestión CVs no puede combinarse con permisos administrativos');
    }

    if (!u.isSuperAdmin) {
      const hasAdminFlags = Boolean(
        targetRole.accesoConsoleAdmin ||
        targetRole.accesoGestionUsuarios ||
        targetRole.accesoGestionTienda ||
        targetRole.accesoGestionWeb ||
        targetRole.accesoContabilidad,
      );
      if (hasAdminFlags) {
        throw new ForbiddenException('Solo superadmin puede crear usuarios con permisos administrativos');
      }
    }
    if (file) {
      createUserDto.avatarUrl = `/uploads/users/${file.filename}`;
    }
    return this.usersService.create(createUserDto);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.USERS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  async findAll(@CurrentUser() user: any, @Query() query: PaginationQueryDto) {
    return this.usersService.findAllVisible(user, query);
  }

  @Get('assignable')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.USERS_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  async findAssignable(@CurrentUser() user: any) {
    // Cargar rol completo del usuario actual
    const userWithRole = await this.usersService.findOne(user.id);
    const userFull = {
      ...user,
      role: userWithRole?.role,
    };
    return this.usersService.findAssignableUsers(userFull);
  }

  @Get('public-team')
  async findPublicTeam(@Query('limit') limit?: string) {
    const parsed = Number(limit);
    return this.usersService.findPublicTeam(Number.isFinite(parsed) ? parsed : 12);
  }

  @Get('next-employee-number')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.USERS_MANAGE] })
  async nextEmployeeNumber() {
    return { employeeNumber: await this.usersService.getNextEmployeeNumber() };
  }

  @Get('profile/me')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  getMyProfile(@CurrentUser() user: any) {
    return this.usersService.getProfile(user.id);
  }

  @Patch('profile/me')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  async updateMyProfile(@CurrentUser() user: any, @Body() body: any) {
    return this.usersService.upsertProfile(user.id, {
      telefono: body.telefono || null,
      fechaNacimiento: body.fechaNacimiento ? new Date(body.fechaNacimiento) : null,
      direccion: body.direccion || null,
      colonia: body.colonia || null,
      ciudad: body.ciudad || null,
      estado: body.estado || null,
      codigoPostal: body.codigoPostal || null,
      pais: body.pais || null,
      curp: body.curp || null,
      rfc: body.rfc || null,
      ineNumero: body.ineNumero || null,
      nss: body.nss || null,
      contactoEmergenciaNombre: body.contactoEmergenciaNombre || null,
      contactoEmergenciaTelefono: body.contactoEmergenciaTelefono || null,
    });
  }

  @Post('profile/me/documents')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  @UseInterceptors(FilesInterceptor('files', 10, { dest: getUserDocsUploadDir(__dirname) }))
  async uploadMyDocuments(
    @CurrentUser() user: any,
    @UploadedFiles() files: any[],
    @Body() body: any,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Archivos requeridos');
    }
    const invalid = files.find((file) => {
      const name = (file.originalname || '').toLowerCase();
      const isPdf = (file.mimetype || '').includes('pdf') || name.endsWith('.pdf');
      return !isPdf;
    });
    if (invalid) {
      throw new BadRequestException('Solo se permiten archivos PDF');
    }
    const tipo = body.tipo || 'Documento';
    const docs = files.map((file) => ({
      tipo,
      archivoUrl: `/uploads/user-docs/${file.filename}`,
    }));
    return this.usersService.addDocuments(user.id, docs);
  }

  @Get(':id/profile')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.USERS_REVIEW] })
  getProfile(@Param('id') id: string) {
    return this.usersService.getProfile(+id);
  }

  @Patch(':id/profile/review')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.USERS_REVIEW] })
  reviewProfile(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.usersService.updateProfileReview(+id, {
      estatus: body.estatus || 'Pendiente',
      observaciones: body.observaciones || null,
      aprobadoPorId: user.id,
      revisadoEn: new Date(),
    });
  }

  @Patch('documents/:id/review')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.USERS_REVIEW] })
  reviewDocument(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.usersService.updateDocumentReview(+id, {
      estatus: body.estatus || 'Pendiente',
      observaciones: body.observaciones || null,
      aprobadoPorId: user.id,
      revisadoEn: new Date(),
    });
  }

  @Get('documents/:id/download')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.USERS_REVIEW, PERMISSIONS.USERS_MANAGE] })
  async downloadDocument(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const document = await this.usersService.getAuthorizedDocument(+id, user);
    const fileName = basename(document.archivoUrl || 'documento.pdf');
    const absolutePath = join(this.userDocsUploadDir, fileName);

    if (!existsSync(absolutePath)) {
      throw new NotFoundException('Archivo no encontrado');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    const stream = createReadStream(absolutePath);
    stream.pipe(res);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.USERS_MANAGE] })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.USERS_MANAGE] })
  @UseInterceptors(FileInterceptor('avatar', buildAvatarUploadOptions(__dirname)))
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @UploadedFile() file?: any,
  ) {
    const userId = +id;
    return this.usersService.findOne(userId).then(async (existingUser) => {
      const previousAvatar = String(existingUser?.avatarUrl || '').trim();

      if (file) {
        updateUserDto.avatarUrl = `/uploads/users/${file.filename}`;
      }

      const updated = await this.usersService.update(userId, updateUserDto);
      const nextAvatar = String(updated?.avatarUrl || '').trim();

      if (previousAvatar && previousAvatar !== nextAvatar && previousAvatar.startsWith('/uploads/users/')) {
        const oldFileName = basename(previousAvatar);
        const oldFilePath = join(this.usersUploadDir, oldFileName);
        if (existsSync(oldFilePath)) {
          try {
            unlinkSync(oldFilePath);
          } catch {
            // Ignore cleanup failures; avatar update already succeeded.
          }
        }
      }

      return updated;
    });
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.USERS_MANAGE] })
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    const target = await this.usersService.findOne(+id);
    if (!target) throw new ForbiddenException('Usuario no encontrado');
    const protectedEmails = ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'];
    if (protectedEmails.includes(target.email.toLowerCase())) {
      throw new ForbiddenException('Este usuario no puede eliminarse');
    }
    if (!user.isSuperAdmin && target.departmentId !== user.departmentId) {
      throw new ForbiddenException('Solo puedes eliminar usuarios de tu departamento');
    }
    return this.usersService.remove(+id);
  }
}
