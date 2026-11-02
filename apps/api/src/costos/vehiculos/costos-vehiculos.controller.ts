import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { diskStorage } from 'multer';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { FileFieldsInterceptor, FileInterceptor } from '../../common/files/interceptores-subida.js';
import { PERMISSIONS } from '../../common/permissions.js';
import { RBAC, RbacGuard } from '../../common/rbac.guard.js';
import { CurrentCompanyId } from '../../common/tenant/current-company.decorator.js';
import { requireCompanyId } from '../../common/tenant/tenant-scope.js';
import { getUploadSubdir } from '../../common/upload-paths.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ActorCostos } from '../costos-acceso.js';
import { CostosVehiculosService, TIPOS_DOCUMENTO } from './costos-vehiculos.service.js';
import { LecturaVehiculoService } from './lectura-vehiculo.service.js';

const TOPE_PDF = 120 * 1024 * 1024;
const TOPE_FOTO = 15 * 1024 * 1024;
const VER = [PERMISSIONS.VEHICLES_VIEW, PERMISSIONS.VEHICLES_REQUEST, PERMISSIONS.VEHICLES_INVENTORY];
const USAR = [PERMISSIONS.VEHICLES_REQUEST, PERMISSIONS.VEHICLES_INVENTORY];
/** La contadora ve Tarifas por su puesto, aunque su rol no administre vehículos. */
const ESTANDAR = [...VER, PERMISSIONS.CONSOLE_ACCESS];

/** Se guarda con su extensión: el navegador abre el PDF en vez de bajar un archivo sin nombre. */
const almacen = () =>
  diskStorage({
    destination: getUploadSubdir(__dirname, 'vehicles'),
    filename: (_req, archivo, cb) => cb(null, `${randomUUID()}${extname(archivo.originalname || '').toLowerCase().slice(0, 8)}`),
  });

const soloPdf = (_req: unknown, archivo: { mimetype?: string; originalname?: string }, cb: (e: Error | null, ok: boolean) => void) => {
  const esPdf = archivo.mimetype === 'application/pdf' || /\.pdf$/i.test(archivo.originalname ?? '');
  cb(esPdf ? null : new BadRequestException('El manual debe ser un PDF'), esPdf);
};

const url = (archivo?: { filename?: string }) => (archivo?.filename ? `/uploads/vehicles/${archivo.filename}` : null);

class PlanDto {
  @IsOptional() @Type(() => Number) @IsInt() id?: number | null;
  @IsString() @MaxLength(120) concepto!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) @Max(1000000) cadaKm?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(240) cadaMeses?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) costoEstimado?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) paginaManual?: number | null;
}

class CostoDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) valor?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) valorLlantas?: number;
  /** Fracción: 0.3 = 30 %. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1) rescatePct?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1000) vidaKm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(100) kmAnio?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(2) tasaInteres?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1) primaSeguro?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(5) ko?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) precioCombustible?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) costoAceite?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(100) aceiteCadaKm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(100) vidaLlantasKm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) otrosAnuales?: number;
}

class ManualDto {
  @IsString() @MaxLength(500) url!: string;
  @IsString() @MaxLength(160) nombre!: string;
  @IsOptional() @Type(() => Number) @IsInt() paginas?: number | null;
}

class FichaDto {
  @IsOptional() @IsString() @MaxLength(100) nombre?: string | null;
  @IsOptional() @IsString() @MaxLength(20) placas?: string | null;
  @IsOptional() @IsString() @MaxLength(500) notas?: string | null;
  @IsOptional() @IsString() @MaxLength(60) marca?: string | null;
  @IsOptional() @IsString() @MaxLength(80) modelo?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1950) @Max(2100) anio?: number | null;
  @IsOptional() @IsString() @MaxLength(80) version?: string | null;
  @IsOptional() @IsString() @MaxLength(30) numeroSerie?: string | null;
  @IsOptional() @IsString() @MaxLength(80) motor?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) potenciaHp?: number | null;
  @IsOptional() @IsString() @MaxLength(40) transmision?: string | null;
  @IsOptional() @IsString() @MaxLength(40) combustible?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) tanqueLitros?: number | null;
  @IsOptional() @IsString() @MaxLength(40) aceiteTipo?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.1) aceiteLitros?: number | null;
  @IsOptional() @IsString() @MaxLength(30) llantaMedida?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) llantaPsi?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) cargaKg?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.1) @Max(100) rendimientoOficial?: number | null;
  @IsOptional() @IsDateString() fechaCompra?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) odometroCompra?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) odometroAlta?: number | null;
  @IsOptional() @IsObject() fuentes?: Record<string, unknown> | null;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PlanDto) plan?: PlanDto[] | null;
  @IsOptional() @ValidateNested() @Type(() => CostoDto) costo?: CostoDto | null;
  @IsOptional() @ValidateNested() @Type(() => ManualDto) manual?: ManualDto | null;
}

class EstandarDto extends CostoDto {
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PlanDto) plan?: PlanDto[] | null;
}

class PlanCompletoDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => PlanDto) plan!: PlanDto[];
}

class RendimientoDto {
  @IsOptional() @IsString() @MaxLength(60) marca?: string | null;
  @IsOptional() @IsString() @MaxLength(80) modelo?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() anio?: number | null;
  @IsOptional() @IsString() @MaxLength(80) version?: string | null;
  @IsOptional() @IsString() @MaxLength(40) transmision?: string | null;
  @IsOptional() @IsString() @MaxLength(40) combustible?: string | null;
}

class DocumentoEdicionDto {
  @IsOptional() @IsString() @MaxLength(160) nombre?: string;
  @IsOptional() @IsDateString() venceEl?: string | null;
}

/** Los campos de un formulario con archivo llegan como texto. */
const aNumero = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Ficha, gasolina y servicios de un vehículo (`docs/COSTOS-PRECIOS-UNITARIOS.md`, «Fase 3 ampliada»).
 *
 * Mismo permiso que el resto de `vehicles`: inventario administra y quien usa los vehículos registra sus
 * cargas. Lo que es dinero se decide adentro, según quién pregunta.
 */
@Controller('vehicles/ficha')
@UseGuards(RbacGuard)
export class CostosVehiculosController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehiculos: CostosVehiculosService,
    private readonly lectura: LecturaVehiculoService,
  ) {}

  /** El puesto no viene en el token, y es lo que distingue a la contadora. */
  private async actor(user: any): Promise<ActorCostos> {
    const fila = user?.id
      ? await this.prisma.user.findUnique({ where: { id: Number(user.id) }, select: { puesto: true } })
      : null;
    return {
      id: user?.id ?? null,
      roleKey: user?.roleKey ?? null,
      role: user?.role ?? null,
      email: user?.email ?? null,
      isSuperAdmin: Boolean(user?.isSuperAdmin),
      superadmin: Boolean(user?.superadmin),
      puesto: fila?.puesto ?? null,
    };
  }

  /* Rutas fijas antes que `:id`. */

  @Get('omisiones')
  @RBAC({ anyPermissions: ESTANDAR })
  async omisiones(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.vehiculos.omisiones(companyId, await this.actor(user));
  }

  @Put('estandar')
  @RBAC({ anyPermissions: ESTANDAR })
  async guardarEstandar(@Body() dto: EstandarDto, @CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.vehiculos.guardarEstandar(companyId, dto, await this.actor(user));
  }

  @Get('flotilla')
  @RBAC({ anyPermissions: VER })
  async flotilla(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Query('mes') mes?: string) {
    return this.vehiculos.flotilla(companyId, mes, await this.actor(user));
  }

  /** Sube el manual y devuelve lo leído. No guarda nada del vehículo hasta que alguien confirme. */
  @Post('leer-manual')
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_INVENTORY] })
  @UseInterceptors(FileInterceptor('archivo', { storage: almacen(), limits: { fileSize: TOPE_PDF }, fileFilter: soloPdf }))
  async leerManual(
    @UploadedFile() archivo: any,
    @CurrentCompanyId() companyId: number | null,
    @Body('pista') pista?: string,
  ) {
    if (!archivo?.path) throw new BadRequestException('Falta el PDF del manual');
    const tenantId = requireCompanyId(companyId);
    const leido = await this.lectura.leerManual(tenantId, archivo.path, pista);
    return {
      ...leido,
      archivo: { url: url(archivo), nombre: String(archivo.originalname ?? 'Manual').slice(0, 160), paginas: leido.paginas },
    };
  }

  @Post('rendimiento-oficial')
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_INVENTORY] })
  async rendimientoOficial(@Body() dto: RendimientoDto, @CurrentCompanyId() companyId: number | null) {
    return { rendimiento: await this.lectura.rendimientoOficial(requireCompanyId(companyId), dto) };
  }

  /** Lee una foto y devuelve lo que entendió. La foto no se guarda aquí: se manda con el formulario. */
  @Post('leer-foto')
  @RBAC({ anyPermissions: USAR })
  @UseInterceptors(FileInterceptor('foto', { limits: { fileSize: TOPE_FOTO } }))
  async leerFoto(
    @UploadedFile() foto: any,
    @CurrentCompanyId() companyId: number | null,
    @Body('tipo') tipo: string,
    @Body('odometroPrevio') odometroPrevio?: string,
  ) {
    const tenantId = requireCompanyId(companyId);
    if (tipo === 'TICKET') return this.lectura.leerTicket(tenantId, foto?.buffer);
    if (tipo === 'TABLERO') return this.lectura.leerTablero(tenantId, foto?.buffer, aNumero(odometroPrevio));
    throw new BadRequestException('Tipo de foto inválido');
  }

  @Post()
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_INVENTORY] })
  async alta(@Body() dto: FichaDto, @CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.vehiculos.guardar(companyId, null, dto, await this.actor(user));
  }

  @Get(':id')
  @RBAC({ anyPermissions: VER })
  async ficha(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.vehiculos.ficha(companyId, id, await this.actor(user));
  }

  /** `?recostear=1` vuelve a costear los viajes ya cargados con la tarifa nueva. */
  @Put(':id')
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_INVENTORY] })
  async editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FichaDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('recostear') recostear?: string,
  ) {
    return this.vehiculos.guardar(companyId, id, dto, await this.actor(user), { recostear: recostear === '1' });
  }

  @Put(':id/plan')
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_INVENTORY] })
  async plan(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PlanCompletoDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.vehiculos.guardarPlan(companyId, id, dto.plan, await this.actor(user));
  }

  @Post(':id/servicios')
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_INVENTORY] })
  @UseInterceptors(FileInterceptor('comprobante', { storage: almacen(), limits: { fileSize: TOPE_FOTO } }))
  async servicio(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() comprobante: any,
    @Body() body: Record<string, string>,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const planIds = String(body?.planIds ?? '')
      .split(',')
      .map((x) => Number(x))
      .filter((x) => Number.isInteger(x) && x > 0);
    return this.vehiculos.registrarServicio(
      companyId,
      id,
      {
        fecha: body?.fecha,
        odometro: aNumero(body?.odometro),
        concepto: body?.concepto,
        costo: aNumero(body?.costo),
        proveedor: body?.proveedor,
        notas: body?.notas,
        planIds,
        comprobanteUrl: url(comprobante),
      },
      await this.actor(user),
    );
  }

  @Delete(':id/servicios/:servicioId')
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_INVENTORY] })
  async quitarServicio(
    @Param('id', ParseIntPipe) id: number,
    @Param('servicioId', ParseIntPipe) servicioId: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.vehiculos.quitarServicio(companyId, id, servicioId, await this.actor(user));
  }

  @Post(':id/cargas')
  @RBAC({ anyPermissions: USAR })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'ticket', maxCount: 1 },
        { name: 'tablero', maxCount: 1 },
      ],
      { storage: almacen(), limits: { fileSize: TOPE_FOTO } },
    ),
  )
  async carga(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() archivos: Record<string, any[]> | undefined,
    @Body() body: Record<string, string>,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.vehiculos.registrarCarga(
      companyId,
      id,
      {
        fecha: body?.fecha || null,
        odometro: aNumero(body?.odometro) as number,
        litros: aNumero(body?.litros) as number,
        importe: aNumero(body?.importe) as number,
        tanqueLleno: String(body?.tanqueLleno ?? 'true') !== 'false',
        ticketUrl: url(archivos?.ticket?.[0]),
        tableroUrl: url(archivos?.tablero?.[0]),
      },
      await this.actor(user),
    );
  }

  @Delete(':id/cargas/:cargaId')
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_INVENTORY] })
  async quitarCarga(
    @Param('id', ParseIntPipe) id: number,
    @Param('cargaId', ParseIntPipe) cargaId: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.vehiculos.quitarCarga(companyId, id, cargaId, await this.actor(user));
  }

  @Post(':id/documentos')
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_INVENTORY] })
  @UseInterceptors(FileInterceptor('archivo', { storage: almacen(), limits: { fileSize: TOPE_PDF } }))
  async documento(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() archivo: any,
    @Body() body: Record<string, string>,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (!archivo?.filename) throw new BadRequestException('Falta el archivo');
    const tipo = String(body?.tipo ?? '').toUpperCase();
    if (!(TIPOS_DOCUMENTO as readonly string[]).includes(tipo)) throw new BadRequestException('Tipo de documento inválido');
    return this.vehiculos.agregarDocumento(
      companyId,
      id,
      {
        tipo,
        nombre: body?.nombre || String(archivo.originalname ?? tipo),
        url: url(archivo) as string,
        venceEl: body?.venceEl || null,
      },
      await this.actor(user),
    );
  }

  @Patch(':id/documentos/:documentoId')
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_INVENTORY] })
  async editarDocumento(
    @Param('id', ParseIntPipe) id: number,
    @Param('documentoId', ParseIntPipe) documentoId: number,
    @Body() dto: DocumentoEdicionDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.vehiculos.editarDocumento(companyId, id, documentoId, dto, await this.actor(user));
  }

  @Delete(':id/documentos/:documentoId')
  @RBAC({ permissions: [PERMISSIONS.VEHICLES_INVENTORY] })
  async quitarDocumento(
    @Param('id', ParseIntPipe) id: number,
    @Param('documentoId', ParseIntPipe) documentoId: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.vehiculos.quitarDocumento(companyId, id, documentoId, await this.actor(user));
  }
}
