import type { Response } from 'express';
import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Patch,
  Query,
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
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { ExcelExportService } from '../common/excel-export.service.js';
import { ExcelImportService } from '../common/excel-import.service.js';

@Controller('viatics')
export class ViaticosController {
  constructor(
    private readonly viaticosService: ViaticosService,
    private readonly usersService: UsersService,
    private readonly excelExport: ExcelExportService,
    private readonly excelImport: ExcelImportService,
  ) {}

  // Endpoint para obtener todos los viáticos
  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VIATICS_VIEW] })
  async findAll(@CurrentUser() user: any, @Query() query: PaginationQueryDto) {
    return this.viaticosService.findAll(user, query);
  }

  // Exportar viáticos (CSV o JSON)
  @Get('export/:format')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VIATICS_EXPORT] })
  async export(@CurrentUser() user: any, @Param('format') format: string, @Res() res: Response) {
    const result = await this.viaticosService.findAll(user);
    const data: any[] = Array.isArray(result) ? result : (result as any).data;
    if (format === 'xlsx') {
      const buffer = await this.excelExport.exportToExcel(data, 'viatics');
      res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.attachment('viaticos.xlsx');
      return res.send(Buffer.from(buffer));
    }
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
      const result = await this.excelImport.importExcel('viatic', file.buffer);
      return res.json(result);
    } catch (e) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: e instanceof Error ? e.message : 'Archivo inválido o error de importación' });
    }
  }

  @Patch(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VIATICS_MANAGE] })
  update(@Param('id') id: string, @Body() body: any) {
    return this.viaticosService.update(+id, body);
  }
}


