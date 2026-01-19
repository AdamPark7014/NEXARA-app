//
import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Res,
  UploadedFile,
  UseInterceptors,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { VehiclesService } from './vehicles.service.js';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  // Endpoint para obtener todos los vehículos
  @Get()
  @UseGuards(RbacGuard)
  async findAll(@CurrentUser() user: any) {
    if (user.nivelAutoridad === 100) {
      return this.vehiclesService.findAll();
    } else if (user.nivelAutoridad === 50) {
      return this.vehiclesService.findByDepartment(user.departmentId);
    } else {
      return this.vehiclesService.findByResponsible(user.id);
    }
  }

  // Exportar vehículos (CSV o JSON)
  @Get('export/:format')
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 50 })
  async export(
    @CurrentUser() user: any,
    @Param('format') format: string,
    @Res() res: Response,
  ) {
    let data;
    if (user.nivelAutoridad === 100) {
      data = await this.vehiclesService.findAll();
    } else if (user.nivelAutoridad === 50) {
      data = await this.vehiclesService.findByDepartment(user.departmentId);
    } else {
      data = await this.vehiclesService.findByResponsible(user.id);
    }
    if (format === 'csv') {
      const csv = this.vehiclesService.toCSV(data);
      res.header('Content-Type', 'text/csv');
      res.attachment('vehiculos.csv');
      return res.send(csv);
    } else {
      res.header('Content-Type', 'application/json');
      res.attachment('vehiculos.json');
      return res.send(JSON.stringify(data, null, 2));
    }
  }

  // Importar vehículos desde archivo JSON
  @Post('import')
  @UseGuards(RbacGuard)
  @RBAC({ minLevel: 100 })
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @UploadedFile() file: any,
    @Res() res: Response,
  ) {
    if (!file) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: 'Archivo requerido' });
    }
    try {
      const json = JSON.parse(file.buffer.toString());
      const result = await this.vehiclesService.importMany(json);
      return res.status(HttpStatus.OK).json({ imported: typeof result === 'number' ? result : 0 });
    } catch (err) {
      let errorMsg = '';
      if (err instanceof Error) {
        errorMsg = err.message;
      } else if (typeof err === 'object' && err !== null && 'message' in err) {
        errorMsg = (err as any).message;
      } else {
        errorMsg = String(err);
      }
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: 'Error al importar', error: errorMsg });
    }
  }
}
// ...existing code...
