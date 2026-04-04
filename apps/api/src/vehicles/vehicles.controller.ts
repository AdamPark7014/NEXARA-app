//
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { VehiclesService } from './vehicles.service.js';
import { UsersService } from '../users/users.service.js';
import { getUploadSubdir } from '../common/upload-paths.js';
import { PERMISSIONS } from '../common/permissions.js';
import { ExcelExportService } from '../common/excel-export.service.js';
import { ExcelImportService } from '../common/excel-import.service.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';

@Controller('vehicles')
export class VehiclesController {
  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly usersService: UsersService,
    private readonly excelExport: ExcelExportService,
    private readonly excelImport: ExcelImportService,
  ) {}

  // Endpoint para obtener todos los vehículos
  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_VIEW] })
  async findAll(@CurrentUser() user: any, @Query() query: PaginationQueryDto) {
    if (user.isSuperAdmin) {
      return this.vehiclesService.findAll(query);
    } else if (user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)) {
      // Admin consola: ve sus propios vehículos + vehículos de usuarios normales
      const allDeptUsers = await this.usersService.findByDepartment(user.departmentId);
      const allowedUserIds = [
        user.id,
        ...allDeptUsers
          .filter((u: any) => u.role && !u.role.accesoConsoleAdmin)
          .map((u: any) => u.id),
      ];
      return this.vehiclesService.findByAllowedUsers(allowedUserIds);
    } else {
      return this.vehiclesService.findByResponsible(user.id);
    }
  }

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REQUEST] })
  async createRequest(@CurrentUser() user: any, @Body() body: any) {
    const actividadId = Number(body.actividadId);
    if (!actividadId || Number.isNaN(actividadId)) {
      throw new BadRequestException('actividadId invalido');
    }

    const fechaInicioSolicitada = body.fechaInicioSolicitada ? new Date(body.fechaInicioSolicitada) : null;
    const fechaFinSolicitada = body.fechaFinSolicitada ? new Date(body.fechaFinSolicitada) : null;

    if (fechaInicioSolicitada && fechaFinSolicitada && fechaFinSolicitada < fechaInicioSolicitada) {
      throw new BadRequestException('La fecha fin debe ser mayor a la fecha inicio');
    }

    return this.vehiclesService.create({
      actividadId,
      solicitanteId: user.id,
      vehicleId: body.vehicleId ? Number(body.vehicleId) : null,
      nombreVehiculo: body.nombreVehiculo || null,
      placasVehiculo: body.placasVehiculo || null,
      motivoUso: body.motivoUso || null,
      estatusAprobacion: 'Pendiente',
      fechaSolicitud: new Date(),
      fechaInicioSolicitada: fechaInicioSolicitada || null,
      fechaFinSolicitada: fechaFinSolicitada || null,
    });
  }

  @Patch(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REVIEW] })
  async updateRequest(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const updateData: any = {
      estatusAprobacion: body.estatusAprobacion,
      fechaInicioAprobada: body.fechaInicioAprobada ? new Date(body.fechaInicioAprobada) : undefined,
      fechaFinAprobada: body.fechaFinAprobada ? new Date(body.fechaFinAprobada) : undefined,
      penalizacionMonto: body.penalizacionMonto !== undefined && body.penalizacionMonto !== null
        ? Number(body.penalizacionMonto)
        : undefined,
      penalizacionNotas: body.penalizacionNotas !== undefined ? body.penalizacionNotas : undefined,
    };

    if (body.estatusAprobacion && body.estatusAprobacion === 'Aprobado') {
      updateData.fechaInicio = updateData.fechaInicioAprobada || undefined;
      updateData.fechaFin = updateData.fechaFinAprobada || undefined;
    }

    return this.vehiclesService.update(+id, updateData);
  }

  @Post(':id/delivery-evidence')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REQUEST] })
  @UseInterceptors(FilesInterceptor('files', 15, { dest: getUploadSubdir(__dirname, 'vehicles') }))
  async submitDeliveryEvidence(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @UploadedFiles() files: any[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Archivos requeridos');
    }
    if (files.length < 5) {
      throw new BadRequestException('Debes subir minimo 5 fotos de entrega');
    }

    const record = await this.vehiclesService.findOne(+id);
    if (!record) throw new BadRequestException('Solicitud no encontrada');
    if (!user.isSuperAdmin && !user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN) && record.solicitanteId !== user.id) {
      throw new ForbiddenException('No puedes modificar esta solicitud');
    }

    const urls = files.map((file) => `/uploads/vehicles/${file.filename}`);
    const entregaFotos = Array.isArray(record.entregaFotos) ? [...record.entregaFotos, ...urls] : urls;

    return this.vehiclesService.update(+id, {
      entregaFotos,
      entregaEstatus: 'En revision',
    });
  }

  @Patch(':id/delivery-review')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REVIEW] })
  async reviewDelivery(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const approved = Boolean(body.entregaAprobada);
    return this.vehiclesService.update(+id, {
      entregaAprobada: approved,
      entregaEstatus: approved ? 'Aprobada' : 'Rechazada',
      entregaObservaciones: body.entregaObservaciones || null,
      entregaRevisadoPorId: user.id,
      entregaRevisadoEn: new Date(),
    });
  }

  @Post(':id/renewal')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REQUEST] })
  async requestRenewal(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const record = await this.vehiclesService.findOne(+id);
    if (!record) throw new BadRequestException('Solicitud no encontrada');
    if (!user.isSuperAdmin && !user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN) && record.solicitanteId !== user.id) {
      throw new ForbiddenException('No puedes modificar esta solicitud');
    }

    const start = body.renovacionSolicitadaInicio ? new Date(body.renovacionSolicitadaInicio) : null;
    const end = body.renovacionSolicitadaFin ? new Date(body.renovacionSolicitadaFin) : null;
    if (start && end && end < start) {
      throw new BadRequestException('La fecha fin debe ser mayor a la fecha inicio');
    }

    return this.vehiclesService.update(+id, {
      renovacionSolicitadaInicio: start,
      renovacionSolicitadaFin: end,
      renovacionEstatus: 'Pendiente',
    });
  }

  @Patch(':id/renewal-review')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REVIEW] })
  async reviewRenewal(
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const approved = Boolean(body.renovacionAprobada);
    return this.vehiclesService.update(+id, {
      renovacionEstatus: approved ? 'Aprobada' : 'Rechazada',
      fechaFinAprobada: approved && body.fechaFinAprobada ? new Date(body.fechaFinAprobada) : undefined,
      fechaFin: approved && body.fechaFinAprobada ? new Date(body.fechaFinAprobada) : undefined,
    });
  }

  @Get('inventory')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VEHICLES_VIEW, PERMISSIONS.VEHICLES_REQUEST, PERMISSIONS.VEHICLES_INVENTORY] })
  listInventory(@Query() query: PaginationQueryDto) {
    return this.vehiclesService.listAssets(query);
  }

  @Post('inventory')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_INVENTORY] })
  createInventory(@Body() body: any) {
    if (!body.nombre) {
      throw new BadRequestException('Nombre requerido');
    }
    return this.vehiclesService.createAsset({
      nombre: body.nombre,
      placas: body.placas || null,
      estatus: body.estatus || 'Disponible',
      activo: body.activo !== false,
      notas: body.notas || null,
    });
  }

  @Patch('inventory/:id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_INVENTORY] })
  updateInventory(@Param('id') id: string, @Body() body: any) {
    return this.vehiclesService.updateAsset(+id, body);
  }

  @Delete('inventory/:id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_INVENTORY] })
  removeInventory(@Param('id') id: string) {
    return this.vehiclesService.removeAsset(+id);
  }

  // Exportar vehículos (CSV o JSON)
  @Get('export/:format')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_EXPORT] })
  async export(
    @CurrentUser() user: any,
    @Param('format') format: string,
    @Res() res: Response,
  ) {
    let result: any;
    if (user.isSuperAdmin) {
      result = await this.vehiclesService.findAll();
    } else if (user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)) {
      // Admin consola: ve sus propios vehículos + vehículos de usuarios normales
      const allDeptUsers = await this.usersService.findByDepartment(user.departmentId);
      const allowedUserIds = [
        user.id,
        ...allDeptUsers
          .filter((u: any) => u.role && !u.role.accesoConsoleAdmin)
          .map((u: any) => u.id),
      ];
      result = await this.vehiclesService.findByAllowedUsers(allowedUserIds);
    } else {
      result = await this.vehiclesService.findByResponsible(user.id);
    }
    const data: any[] = Array.isArray(result) ? result : result.data;
    if (format === 'xlsx') {
      const buffer = await this.excelExport.exportToExcel(data, 'vehicles');
      res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.attachment('vehiculos.xlsx');
      return res.send(Buffer.from(buffer));
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
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_IMPORT] })
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
      try {
        const result = await this.excelImport.importExcel('vehicle', file.buffer);
        return res.status(HttpStatus.OK).json(result);
      } catch (excelErr) {
        let errorMsg = '';
        if (excelErr instanceof Error) {
          errorMsg = excelErr.message;
        } else if (typeof excelErr === 'object' && excelErr !== null && 'message' in excelErr) {
          errorMsg = (excelErr as any).message;
        } else {
          errorMsg = String(excelErr);
        }
        return res
          .status(HttpStatus.BAD_REQUEST)
          .json({ message: 'Error al importar', error: errorMsg });
      }
    }
  }
}
// ...existing code...
