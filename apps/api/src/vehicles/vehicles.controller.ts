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
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { diskStorage } from 'multer';
import { FileInterceptor, FilesInterceptor, FileFieldsInterceptor } from '../common/files/interceptores-subida.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { VehiclesService } from './vehicles.service.js';
import { UsersService } from '../users/users.service.js';
import { getUploadSubdir } from '../common/upload-paths.js';
import { PERMISSIONS } from '../common/permissions.js';
import { ExcelExportService } from '../common/excel-export.service.js';
import { COLUMNAS_VEHICULOS } from '../common/excel/reportes.js';
import { ExcelImportService } from '../common/excel-import.service.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import {
  SLOTS_CHECKLIST,
  leerMetaDelBody,
  type EntradaChecklist,
} from './checklist-entrega.js';
import { CAMPO_VIDEO_VUELTA, SLOTS_GUIADA, esCapturaGuiada, leerMetaGuiada } from './captura-guiada.js';
import { DanosVehiculoService } from './danos-vehiculo.service.js';
import type { ActorVehiculo, EntradaCaptura } from './vehicles.service.js';

/**
 * Un campo de archivo por foto: las siete del checklist (apps viejas) y las de la captura guiada
 * (8 cuadros de la vuelta, asientos, tablero, kilometraje) más el video de la vuelta. `tablero` está
 * en los dos: se pide una sola vez.
 */
const CAMPOS_CHECKLIST = [...new Set<string>([...SLOTS_CHECKLIST, ...SLOTS_GUIADA, CAMPO_VIDEO_VUELTA])].map((name) => ({
  name,
  maxCount: 1,
}));

/** Un video de 20 s a 720p pesa unos 10 MB; con esto cabe uno a 1080p. Las fotos pesan mucho menos. */
const TOPE_ARCHIVO_CAPTURA = 80 * 1024 * 1024;
const EXTENSIONES_VIDEO = new Set(['.mp4', '.mov', '.m4v', '.webm', '.3gp']);

/** Se guarda con su extensión (el navegador reproduce el video en vez de bajarlo). */
const extensionSegura = (nombre?: string) => {
  const ext = extname(nombre || '').toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
};

/** Subida de la salida/devolución: mismas fotos de siempre y, si viene, el video de la vuelta. */
const opcionesCaptura = () => ({
  storage: diskStorage({
    destination: getUploadSubdir(__dirname, 'vehicles'),
    filename: (_req: unknown, archivo: { originalname?: string }, cb: (e: Error | null, nombre: string) => void) =>
      cb(null, `${randomUUID()}${extensionSegura(archivo.originalname)}`),
  }),
  limits: { fileSize: TOPE_ARCHIVO_CAPTURA, files: CAMPOS_CHECKLIST.length },
  fileFilter: (
    _req: unknown,
    archivo: { fieldname?: string; mimetype?: string; originalname?: string },
    cb: (e: Error | null, ok: boolean) => void,
  ) => {
    if (archivo.fieldname !== CAMPO_VIDEO_VUELTA) return cb(null, true);
    const esVideo = String(archivo.mimetype ?? '').startsWith('video/') || EXTENSIONES_VIDEO.has(extensionSegura(archivo.originalname));
    cb(esVideo ? null : new BadRequestException('La vuelta completa debe ser un video'), esVideo);
  },
});

/** Firma en pantalla: una imagen chica. */
const opcionesFirma = () => ({
  storage: diskStorage({
    destination: getUploadSubdir(__dirname, 'vehicles'),
    filename: (_req: unknown, archivo: { originalname?: string }, cb: (e: Error | null, nombre: string) => void) =>
      cb(null, `firma-${randomUUID()}${extensionSegura(archivo.originalname) || '.png'}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req: unknown, archivo: { mimetype?: string }, cb: (e: Error | null, ok: boolean) => void) => {
    const esImagen = String(archivo.mimetype ?? '').startsWith('image/');
    cb(esImagen ? null : new BadRequestException('La firma debe ser una imagen'), esImagen);
  },
});

const SI = new Set(['true', '1', 'si', 'sí']);

function puedeRevisarVehiculos(user: any): boolean {
  return Boolean(
    user?.isSuperAdmin ||
      user?.permissions?.includes(PERMISSIONS.VEHICLES_REVIEW) ||
      user?.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN),
  );
}

function actorVehiculo(user: any): ActorVehiculo {
  return {
    id: user.id,
    nombre: user.nombre ?? null,
    isSuperAdmin: Boolean(user.isSuperAdmin),
    puedeRevisar: puedeRevisarVehiculos(user),
    puedeInventario: Boolean(user.permissions?.includes(PERMISSIONS.VEHICLES_INVENTORY)),
  };
}

/**
 * Checklist de 7 fotos o captura guiada de 5 pasos, según lo que mande la app. `forzarKm` (registrar
 * un km menor al último porque el anterior estaba mal) solo cuenta si quien registra revisa vehículos.
 */
function entradaCaptura(uploaded: Record<string, any[]> | undefined, body: any, user: any): EntradaCaptura {
  const base = entradaChecklist(uploaded, body);
  const forzarKm = SI.has(String(body?.forzarKm ?? '').trim().toLowerCase()) && puedeRevisarVehiculos(user);
  if (esCapturaGuiada(base.fotos, body)) {
    return {
      version: 2,
      fotos: base.fotos,
      meta: leerMetaGuiada(body),
      odometroKm: base.odometroKm,
      combustible: base.combustible,
      lecturaIa: body?.lecturaIa,
      forzarKm,
    };
  }
  return { ...base, forzarKm };
}

/**
 * Traduce el multipart al contrato del check list. Vive aquí, una sola vez,
 * para que salida/devolución de solicitud y salida/devolución de inventario no
 * puedan divergir otra vez.
 */
function entradaChecklist(uploaded: Record<string, any[]> | undefined, body: any): EntradaChecklist {
  const fotos: Record<string, string> = {};
  for (const [campo, archivos] of Object.entries(uploaded ?? {})) {
    const nombre = archivos?.[0]?.filename;
    if (nombre) fotos[campo] = `/uploads/vehicles/${nombre}`;
  }
  return {
    fotos,
    meta: leerMetaDelBody(body),
    odometroKm: body?.odometroKm,
    // `combustiblePct` es el nombre viejo; se sigue aceptando para no romper
    // una app móvil que todavía no se haya actualizado.
    combustible: body?.combustible ?? body?.combustiblePct,
  };
}

@Controller('vehicles')
export class VehiclesController {
  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly usersService: UsersService,
    private readonly excelExport: ExcelExportService,
    private readonly excelImport: ExcelImportService,
    private readonly danos: DanosVehiculoService,
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
        encargadoId: body.encargadoId ?? null,
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
  @UseInterceptors(FileFieldsInterceptor(CAMPOS_CHECKLIST, opcionesCaptura()))
  async startUse(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles() uploaded: Record<string, any[]>,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.vehiclesService.startUse(+id, actorVehiculo(user), entradaCaptura(uploaded, body, user), companyId);
  }

  @Post(':id/end-use')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REQUEST] })
  @UseInterceptors(FileFieldsInterceptor(CAMPOS_CHECKLIST, opcionesCaptura()))
  async endUse(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles() uploaded: Record<string, any[]>,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.vehiclesService.endUse(+id, actorVehiculo(user), entradaCaptura(uploaded, body, user), companyId);
  }

  // ─── Pantallas de Core ──────────────────────────────────────────────────────

  @Get('flotilla')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VEHICLES_VIEW, PERMISSIONS.VEHICLES_REQUEST, PERMISSIONS.VEHICLES_INVENTORY] })
  listarFlotilla(@CurrentCompanyId() companyId: number | null) {
    return this.vehiclesService.listarFlotilla(companyId);
  }

  @Get('mis-vehiculos')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VEHICLES_VIEW, PERMISSIONS.VEHICLES_REQUEST] })
  misVehiculos(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.vehiclesService.misVehiculos(user.id, companyId);
  }

  @Get('flotilla/:id')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VEHICLES_VIEW, PERMISSIONS.VEHICLES_REQUEST, PERMISSIONS.VEHICLES_INVENTORY] })
  detalleFlotilla(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.vehiclesService.detalleFlotilla(+id, companyId);
  }

  // ─── Captura guiada, firmas, bloque de la actividad, daños e incidencias ──────

  /** Pasos de la captura y el último km de la unidad, para que la app compare antes de mandar. */
  @Get('captura-guiada')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VEHICLES_VIEW, PERMISSIONS.VEHICLES_REQUEST, PERMISSIONS.VEHICLES_INVENTORY] })
  capturaGuiada(@Query('vehiculo') vehiculo: string | undefined, @CurrentCompanyId() companyId: number | null) {
    const id = Number(vehiculo);
    return this.vehiclesService.capturaGuiada(Number.isInteger(id) && id > 0 ? id : null, companyId);
  }

  /** Bloque «Vehículo» de una actividad. */
  @Get('por-actividad/:activityId')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VEHICLES_VIEW, PERMISSIONS.VEHICLES_REQUEST] })
  porActividad(
    @Param('activityId') activityId: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.vehiclesService.porActividad(+activityId, { ...user, esGestor: puedeRevisarVehiculos(user) }, companyId);
  }

  /** Firma de quien entrega o de quien recibe (campo `firma`, con `momento`, `rol` y `nombre`). */
  @Post(':id/firmas')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VEHICLES_REQUEST, PERMISSIONS.VEHICLES_REVIEW] })
  @UseInterceptors(FileInterceptor('firma', opcionesFirma()))
  registrarFirma(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
    @UploadedFile() firma: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (!firma?.filename) throw new BadRequestException('Falta la firma');
    return this.vehiclesService.registrarFirma(
      +id,
      actorVehiculo(user),
      { momento: body?.momento, rol: body?.rol, nombre: body?.nombre, userId: body?.userId, url: `/uploads/vehicles/${firma.filename}` },
      companyId,
    );
  }

  /** Daños que propuso la IA (por omisión, los que faltan por revisar). */
  @Get('danos')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REVIEW] })
  listarDanos(
    @Query('estatus') estatus: string | undefined,
    @Query('uso') uso: string | undefined,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.danos.listarHallazgos(companyId, { estatus, uso: uso ? Number(uso) : undefined });
  }

  /** Liz confirma (abre incidencia con responsable y costo) o descarta con motivo. */
  @Patch('danos/:id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REVIEW] })
  revisarDano(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.danos.revisarHallazgo(+id, user, body ?? {}, companyId);
  }

  /** Volver a correr la comparación antes/después de un uso. */
  @Post(':id/analizar-danos')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REVIEW] })
  async analizarDanos(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    await this.vehiclesService.findOne(+id, companyId);
    return this.danos.analizar(+id);
  }

  @Get('incidencias')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REVIEW] })
  listarIncidencias(
    @Query('estatus') estatus: string | undefined,
    @Query('vehiculo') vehiculo: string | undefined,
    @Query('responsable') responsable: string | undefined,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.danos.listarIncidencias(companyId, {
      estatus,
      vehiculo: vehiculo ? Number(vehiculo) : undefined,
      responsable: responsable ? Number(responsable) : undefined,
    });
  }

  @Post('incidencias')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REVIEW] })
  crearIncidencia(@CurrentUser() user: any, @Body() body: any, @CurrentCompanyId() companyId: number | null) {
    if (!companyId) throw new BadRequestException('Elige la empresa');
    return this.danos.crearIncidencia(user, body ?? {}, companyId);
  }

  @Patch('incidencias/:id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REVIEW] })
  actualizarIncidencia(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.danos.actualizarIncidencia(+id, user, body ?? {}, companyId);
  }

  /** Cobrar al responsable lo decide dirección (el servicio solo lo deja al superadmin). */
  @Patch('incidencias/:id/cobro')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_REVIEW] })
  revisarCobro(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { decision?: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.danos.revisarCobro(+id, user, String(body?.decision ?? ''), companyId);
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

  // ── Salida directa desde inventario: mismo check list que una solicitud ─────
  @Post('inventory/:id/checkout')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VEHICLES_REQUEST, PERMISSIONS.VEHICLES_INVENTORY] })
  @UseInterceptors(FileFieldsInterceptor(CAMPOS_CHECKLIST, opcionesCaptura()))
  async checkoutVehicle(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles() uploaded: Record<string, any[]>,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.vehiclesService.checkoutAsset(+id, actorVehiculo(user), entradaCaptura(uploaded, body, user), companyId, {
      actividadId: body?.actividadId,
      encargadoId: body?.encargadoId,
    });
  }

  // ── Devolución directa al inventario: mismo check list ──────────────────────
  @Post('inventory/:id/return')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.VEHICLES_REQUEST, PERMISSIONS.VEHICLES_INVENTORY] })
  @UseInterceptors(FileFieldsInterceptor(CAMPOS_CHECKLIST, opcionesCaptura()))
  async returnVehicle(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles() uploaded: Record<string, any[]>,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.vehiclesService.returnAsset(+id, actorVehiculo(user), entradaCaptura(uploaded, body, user), companyId);
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
    if (format !== 'xlsx') {
      throw new BadRequestException('Solo se permite format=xlsx. CSV/JSON estan deshabilitados.');
    }
    let result: any;
    let alcance: string;
    if (user.isSuperAdmin) {
      result = await this.vehiclesService.findAll(undefined, companyId);
      alcance = 'Toda la flota de la empresa';
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
      alcance = 'Vehículos propios y del equipo a cargo';
    } else {
      result = await this.vehiclesService.findByResponsible(user.id, companyId);
      alcance = 'Vehículos que solicité';
    }
    const data: any[] = Array.isArray(result) ? result : result.data;
    const buffer = await this.excelExport.exportarReporte({
      titulo: 'Control de vehículos',
      subtitulo: alcance,
      hoja: 'Vehículos',
      columnas: COLUMNAS_VEHICULOS,
      filas: data ?? [],
      generadoPor: user?.nombre ?? null,
      hojaInformacion: true,
      notas: [`Alcance: ${alcance}`],
    });
    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.attachment('vehiculos.xlsx');
    return res.send(buffer);
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
