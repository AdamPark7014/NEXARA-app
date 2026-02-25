import type { Response } from 'express';
import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Patch,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { ViaticosService } from './viaticos.service.js';
import { UsersService } from '../users/users.service.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('viatics')
export class ViaticosController {
  constructor(
    private readonly viaticosService: ViaticosService,
    private readonly usersService: UsersService,
  ) {}

  // Endpoint para obtener todos los viáticos
  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VIATICS_VIEW] })
  async findAll(@CurrentUser() user: any) {
    if (user.isSuperAdmin) {
      return this.viaticosService.findAll();
    }
    if (user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)) {
      // Admin consola: ve sus propios viáticos + viáticos de usuarios normales
      const allDeptUsers = await this.usersService.findByDepartment(user.departmentId);
      const allowedUserIds = [
        user.id,
        ...allDeptUsers
          .filter((u: any) => u.role && !u.role.accesoConsoleAdmin)
          .map((u: any) => u.id),
      ];
      return this.viaticosService.findByAllowedUsers(allowedUserIds);
    }
    return this.viaticosService.findByUser(user.id);
  }

  // Exportar viáticos (CSV o JSON)
  @Get('export/:format')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VIATICS_EXPORT] })
  async export(@Param('format') format: string, @Res() res: Response) {
    const data: any[] = [];
    if (format === 'csv') {
      res.header('Content-Type', 'text/csv');
      res.attachment('viaticos.csv');
      return res.send('');
    } else {
      res.header('Content-Type', 'application/json');
      res.attachment('viaticos.json');
      return res.send(JSON.stringify(data, null, 2));
    }
  }

  // Importar viáticos desde archivo JSON
  @Post('import')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VIATICS_IMPORT] })
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: any, @Res() res: Response) {
    if (!file) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: 'Archivo requerido' });
    }
    try {
      JSON.parse(file.buffer.toString());
      // importMany removed
      return res.json({ message: 'Importación no implementada', count: 0 });
    } catch (e) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: 'Archivo inválido o error de importación' });
    }
  }

  @Patch(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VIATICS_MANAGE] })
  update(@Param('id') id: string, @Body() body: any) {
    return this.viaticosService.update(+id, body);
  }
}

