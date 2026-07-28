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
import { FileInterceptor, FilesInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
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
  async findAll(
    @CurrentUser() user: any,
    @Query() query: PaginationQueryDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (user.isSuperAdmin) {
      return this.vehiclesService.findAll(query, companyId);
    } else if (user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN) || user.permissions?.includes(PERMISSIONS.VEHICLES_REVIEW)) {
      // Admin consola o manager v2: ve sus propios vehículos + vehículos de usuarios normales
      const allDeptUsers = await this.usersService.findByDepartment(user.departmentId);
      const allowedUserIds = [
        user.id,
        ...allDeptUsers
          .filter((u: any) => u.role && !u.role.accesoConsoleAdmin)
          .map((u: any) => u.id),
      ];
      return this.vehiclesService.findByAllowedUsers(allowedUserIds, companyId);
    } else {
      return this.vehiclesService.findByResponsible(user.id, companyId);
    }
  }

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REQUEST] })
  async createRequest(
    @CurrentUser() user: any,
    @Body() body: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const actividadId = Number(body.actividadId);
    if (!actividadId || Number.isNaN(actividadId)) {
      throw new BadRequestException('actividadId invalido');
    }

    const fechaInicioSolicitada = body.fechaInicioSolicitada ? new Date(body.fechaInicioSolicitada) : null;
    const fechaFinSolicitada = body.fechaFinSolicitada ? new Date(body.fechaFinSolicitada) : null;

    if (fechaInicioSolicitada && fechaFinSolicitada && fechaFinSolicitada < fechaInicioSolicitada) {
      throw new BadRequestException('La fecha fin debe ser mayor a la fecha inicio');
    }

    return this.vehiclesService.create(
      {
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
      },
      companyId,
    );
  }

  @Patch(':id/approve')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REVIEW] })
  approve(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { action?: 'approve' | 'reject'; note?: string; fechaInicioAprobada?: string; fechaFinAprobada?: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    const action = body.action === 'reject' ? 'reject' : 'approve';
    return this.vehiclesService.approveOrReject(+id, user, action, body, companyId);
  }

  @Post(':id/start-use')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REQUEST] })
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'interna-0', maxCount: 1 }, { name: 'interna-1', maxCount: 1 },
    { name: 'interna-2', maxCount: 1 }, { name: 'interna-3', maxCount: 1 },
    { name: 'externa-0', maxCount: 1 }, { name: 'externa-1', maxCount: 1 },
    { name: 'externa-2', maxCount: 1 }, { name: 'externa-3', maxCount: 1 },
    { name: 'odometro', maxCount: 1 },
  ], { dest: getUploadSubdir(__dirname, 'vehicles') }))
  async startUse(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles() uploaded: Record<string, any[]>,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const fileMap: Record<string, string> = {};
    for (const [key, arr] of Object.entries(uploaded ?? {})) {
      if (arr?.[0]?.filename) fileMap[key] = `/uploads/vehicles/${arr[0].filename}`;
    }
    return this.vehiclesService.startUse(
      +id,
      user.id,
      fileMap,
      Number(body.odometroKm),
      Number(body.combustiblePct),
      companyId,
    );
  }

  @Post(':id/end-use')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REQUEST] })
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'interna-0', maxCount: 1 }, { name: 'interna-1', maxCount: 1 },
    { name: 'interna-2', maxCount: 1 }, { name: 'interna-3', maxCount: 1 },
    { name: 'externa-0', maxCount: 1 }, { name: 'externa-1', maxCount: 1 },
    { name: 'externa-2', maxCount: 1 }, { name: 'externa-3', maxCount: 1 },
    { name: 'odometro', maxCount: 1 },
  ], { dest: getUploadSubdir(__dirname, 'vehicles') }))
  async endUse(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles() uploaded: Record<string, any[]>,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const fileMap: Record<string, string> = {};
    for (const [key, arr] of Object.entries(uploaded ?? {})) {
      if (arr?.[0]?.filename) fileMap[key] = `/uploads/vehicles/${arr[0].filename}`;
    }
    return this.vehiclesService.endUse(
      +id,
      user.id,
      fileMap,
      Number(body.odometroKm),
      Number(body.combustiblePct),
      companyId,
    );
  }

  @Post('notify-expiring')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REVIEW] })
  notifyExpiring() {
    return this.vehiclesService.notifyExpiringAssignments();
  }

  @Patch(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REVIEW] })
  async updateRequest(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
    @CurrentCompanyId() companyId: number | null,
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

    return this.vehiclesService.update(+id, updateData, companyId);
  }

  @Post(':id/delivery-evidence')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REQUEST] })
  @UseInterceptors(FilesInterceptor('files', 15, { dest: getUploadSubdir(__dirname, 'vehicles') }))
  async submitDeliveryEvidence(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @UploadedFiles() files: any[],
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Archivos requeridos');
    }
    if (files.length < 5) {
      throw new BadRequestException('Debes subir minimo 5 fotos de entrega');
    }

    const record = await this.vehiclesService.findOne(+id, companyId);
    if (!user.isSuperAdmin && !user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN) && !user.permissions?.includes(PERMISSIONS.VEHICLES_REVIEW) && record.solicitanteId !== user.id) {
      throw new ForbiddenException('No puedes modificar esta solicitud');
    }

    const urls = files.map((file) => `/uploads/vehicles/${file.filename}`);
    const entregaFotos = Array.isArray(record.entregaFotos) ? [...record.entregaFotos, ...urls] : urls;

    return this.vehiclesService.update(+id, {
      entregaFotos,
      entregaEstatus: 'En revision',
    }, companyId);
  }

  @Patch(':id/delivery-review')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REVIEW] })
  async reviewDelivery(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const approved = Boolean(body.entregaAprobada);
    return this.vehiclesService.update(+id, {
      entregaAprobada: approved,
      entregaEstatus: approved ? 'Aprobada' : 'Rechazada',
      entregaObservaciones: body.entregaObservaciones || null,
      entregaRevisadoPorId: user.id,
      entregaRevisadoEn: new Date(),
    }, companyId);
  }

  @Post(':id/renewal')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REQUEST] })
  async requestRenewal(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const record = await this.vehiclesService.findOne(+id, companyId);
    if (!user.isSuperAdmin && !user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN) && !user.permissions?.includes(PERMISSIONS.VEHICLES_REVIEW) && record.solicitanteId !== user.id) {
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
    }, companyId);
  }

  @Patch(':id/renewal-review')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REVIEW] })
  async reviewRenewal(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const approved = Boolean(body.renovacionAprobada);
    return this.vehiclesService.update(+id, {
      renovacionEstatus: approved ? 'Aprobada' : 'Rechazada',
      fechaFinAprobada: approved && body.fechaFinAprobada ? new Date(body.fechaFinAprobada) : undefined,
      fechaFin: approved && body.fechaFinAprobada ? new Date(body.fechaFinAprobada) : undefined,
    }, companyId);
  }

  @Get('inventory')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VEHICLES_VIEW, PERMISSIONS.VEHICLES_REQUEST, PERMISSIONS.VEHICLES_INVENTORY] })
  listInventory(@Query() query: PaginationQueryDto, @CurrentCompanyId() companyId: number | null) {
    return this.vehiclesService.listAssets(query, companyId);
  }

  @Get('analytics/usage')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VEHICLES_REVIEW, PERMISSIONS.CONSOLE_ADMIN] })
  usageAnalytics() {
    return this.vehiclesService.getUsageAnalytics();
  }

  @Post('inventory')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_INVENTORY] })
  createInventory(@Body() body: any, @CurrentCompanyId() companyId: number | null) {
    if (!body.nombre) {
      throw new BadRequestException('Nombre requerido');
    }
    return this.vehiclesService.createAsset(
      {
        nombre: body.nombre,
        placas: body.placas || null,
        estatus: body.estatus || 'Disponible',
        activo: body.activo !== false,
        notas: body.notas || null,
      },
      companyId,
    );
  }

  @Patch('inventory/:id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_INVENTORY] })
  updateInventory(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.vehiclesService.updateAsset(+id, body, companyId);
  }

  @Delete('inventory/:id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_INVENTORY] })
  removeInventory(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.vehiclesService.removeAsset(+id, companyId);
  }

  // ── Checkout: engineer takes "before" photos and marks vehicle as taken ──────
  @Post('inventory/:id/checkout')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VEHICLES_REQUEST, PERMISSIONS.VEHICLES_INVENTORY] })
  @UseInterceptors(FilesInterceptor('photos', 10, { dest: getUploadSubdir(__dirname, 'vehicles') }))
  async checkoutVehicle(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @UploadedFiles() files: any[],
    @CurrentCompanyId() companyId: number | null,
  ) {
    const asset = await this.vehiclesService.getAsset(+id, companyId);
    if (!asset) throw new BadRequestException('Vehículo no encontrado');
    if (asset.estatus === 'Asignado') {
      throw new BadRequestException('El vehículo ya está asignado');
    }
    const photoUrls = (files ?? []).map(f => `/uploads/vehicles/${f.filename}`);
    return this.vehiclesService.updateAsset(+id, {
      estatus: 'Asignado',
      assignedToId: user.id,
      assignedAt: new Date(),
      salidaFotos: photoUrls,
      devolucionFotos: null,
      tiempoUsoMinutos: null,
    }, companyId);
  }

  // ── Return: engineer takes "after" photos, system logs time used ─────────────
  @Post('inventory/:id/return')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VEHICLES_REQUEST, PERMISSIONS.VEHICLES_INVENTORY] })
  @UseInterceptors(FilesInterceptor('photos', 10, { dest: getUploadSubdir(__dirname, 'vehicles') }))
  async returnVehicle(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @UploadedFiles() files: any[],
    @CurrentCompanyId() companyId: number | null,
  ) {
    const asset = await this.vehiclesService.getAsset(+id, companyId);
    if (!asset) throw new BadRequestException('Vehículo no encontrado');
    if (!user.isSuperAdmin && !user.permissions?.includes(PERMISSIONS.VEHICLES_INVENTORY) && asset.assignedToId !== user.id) {
      throw new ForbiddenException('Solo el asignatario puede devolver el vehículo');
    }
    const photoUrls = (files ?? []).map(f => `/uploads/vehicles/${f.filename}`);
    const minutosUso = asset.assignedAt
      ? Math.round((Date.now() - new Date(asset.assignedAt).getTime()) / 60000)
      : null;
    return this.vehiclesService.updateAsset(+id, {
      estatus: 'Disponible',
      assignedToId: null,
      assignedAt: null,
      devolucionFotos: photoUrls,
      tiempoUsoMinutos: minutosUso,
    }, companyId);
  }

  // Exportar vehículos (CSV o JSON)
  @Get('export/:format')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_EXPORT] })
  async export(
    @CurrentUser() user: any,
    @Param('format') format: string,
    @Res() res: Response,
    @CurrentCompanyId() companyId: number | null,
  ) {
    let result: any;
    if (user.isSuperAdmin) {
      result = await this.vehiclesService.findAll(undefined, companyId);
    } else if (user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN) || user.permissions?.includes(PERMISSIONS.VEHICLES_REVIEW)) {
      // Admin consola o manager v2: ve sus propios vehículos + vehículos de usuarios normales
      const allDeptUsers = await this.usersService.findByDepartment(user.departmentId);
      const allowedUserIds = [
        user.id,
        ...allDeptUsers
          .filter((u: any) => u.role && !u.role.accesoConsoleAdmin)
          .map((u: any) => u.id),
      ];
      result = await this.vehiclesService.findByAllowedUsers(allowedUserIds, companyId);
    } else {
      result = await this.vehiclesService.findByResponsible(user.id, companyId);
    }
    const data: any[] = Array.isArray(result) ? result : result.data;
    if (format === 'xlsx') {
      const buffer = await this.excelExport.exportToExcel(data, 'vehicles');
      res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.attachment('vehiculos.xlsx');
      return res.send(Buffer.from(buffer));
    }
    throw new BadRequestException('Solo se permite format=xlsx. CSV/JSON estan deshabilitados.');
  }

  // Importar vehículos desde archivo JSON
  @Post('import')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_IMPORT] })
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @UploadedFile() file: any,
    @Res() res: Response,
    @CurrentCompanyId() companyId: number | null,
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
        const result = await this.excelImport.importExcel('vehicle', file.buffer, companyId);
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
        const status =
          excelErr instanceof ForbiddenException ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST;
        return res
          .status(status)
          .json({ message: 'Error al importar', error: errorMsg });
      }
    }
  }
}
// ...existing code...
