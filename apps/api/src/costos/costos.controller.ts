import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { workDateKey } from '../common/time/workday.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TIPOS_LIGA } from './calculos/sugerir-liga.js';
import { UNIDADES_EQUIPO } from './calculos/tarifa-equipo.js';
import { puedeLigarHoras, veTodoCostos, type ActorCostos } from './costos-acceso.js';
import { CostosLigaService, PERIODOS, type Periodo } from './costos-liga.service.js';
import { CostosProyectoService } from './costos-proyecto.service.js';
import { CostosTarifasService } from './costos-tarifas.service.js';
import { LibroCostosService } from './libro-costos.service.js';

class ParametrosDto {
  /** Fracción: 0.25 = 25 %. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1) ps?: number;
  @IsOptional() @IsBoolean() psValidado?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(60) otrosDias?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(15) @Max(120) aguinaldoDias?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.25) @Max(2) primaVacacional?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1) kh?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1) ks?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(2) indirectoPct?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(2) tasaInteres?: number | null;
  @IsOptional() @IsString() @MaxLength(500) notas?: string | null;
}

class CategoriaDto {
  @IsOptional() @IsString() @MaxLength(80) nombre?: string;
  @IsOptional() @IsIn(['DIRECTO', 'INDIRECTO']) tipo?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) sueldoSemanalRef?: number | null;
  @IsOptional() @IsBoolean() activo?: boolean;
}

class PersonaDto {
  @IsOptional() @Type(() => Number) @IsInt() categoriaId?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1) psPropio?: number | null;
}

class FichaDto {
  @IsOptional() @IsIn(['VEHICULO', 'HERRAMIENTA']) tipo?: string;
  @IsOptional() @IsString() @MaxLength(120) nombre?: string;
  @IsOptional() @IsIn([...UNIDADES_EQUIPO]) unidad?: string;
  @IsOptional() @Type(() => Number) @IsInt() vehicleId?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() toolId?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) valor?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) valorLlantas?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1) rescatePct?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) vidaUnidades?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unidadesAnio?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(2) tasaInteres?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1) primaSeguro?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(5) ko?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) rendimiento?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) precioCombustible?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) costoAceite?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) aceiteCadaUnidades?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) vidaLlantasUnidades?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) otrosAnuales?: number;
  @IsOptional() @IsString() @MaxLength(300) notas?: string | null;
}

class LigarDto {
  @IsIn([...TIPOS_LIGA]) tipo!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) id?: number | null;
}

class SugerirDto {
  @IsOptional() @IsIn([...PERIODOS]) periodo?: Periodo;
}

/**
 * Costos: libro de costos, tarifas y bandeja de horas sin proyecto. El libro solo lee lo que la
 * operación ya registra (`docs/COSTOS-PRECIOS-UNITARIOS.md`).
 *
 * `/api/costos/**` lo abre la matriz de URLs a quien coordina y a quien lleva las cuentas; aquí se
 * afina: sueldos y tarifas solo para CEO y contadora.
 */
@Controller('costos')
@UseGuards(UrlAccessGuard, RbacGuard)
export class CostosController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tarifas: CostosTarifasService,
    private readonly libro: LibroCostosService,
    private readonly liga: CostosLigaService,
    private readonly proyectos: CostosProyectoService,
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

  private async exigirTodo(user: any): Promise<ActorCostos> {
    const actor = await this.actor(user);
    if (!veTodoCostos(actor)) throw new ForbiddenException('Solo dirección y contabilidad ven las tarifas de costo');
    return actor;
  }

  private async exigirLigar(user: any): Promise<ActorCostos> {
    const actor = await this.actor(user);
    if (!puedeLigarHoras(actor)) throw new ForbiddenException('Tu perfil no liga horas a proyectos');
    return actor;
  }

  private periodo(valor: unknown): Periodo {
    return (PERIODOS as readonly string[]).includes(String(valor)) ? (valor as Periodo) : 'semana';
  }

  /** Qué puede hacer quien entra. La web lo usa para enseñar pestañas; la API revisa cada ruta. */
  @Get('acceso')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  async acceso(@CurrentUser() user: any) {
    const actor = await this.actor(user);
    return { veTodo: veTodoCostos(actor), puedeLigar: puedeLigarHoras(actor) };
  }

  /* ── Tarifas ──────────────────────────────────────────────────────────── */

  @Get('tarifas')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  async verTarifas(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('anio') anio?: string,
  ) {
    await this.exigirTodo(user);
    const pedido = Number(anio);
    const vigente = Number(workDateKey(new Date()).slice(0, 4));
    return this.tarifas.tarifas(companyId, Number.isInteger(pedido) && pedido >= 2020 && pedido <= 2100 ? pedido : vigente);
  }

  @Put('parametros/:anio')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  async guardarParametros(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('anio', ParseIntPipe) anio: number,
    @Body() dto: ParametrosDto,
  ) {
    const actor = await this.exigirTodo(user);
    return this.tarifas.guardarParametros(companyId, anio, dto as never, actor.id);
  }

  @Post('categorias')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  async crearCategoria(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Body() dto: CategoriaDto) {
    await this.exigirTodo(user);
    return this.tarifas.crearCategoria(companyId, dto);
  }

  @Patch('categorias/:id')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  async editarCategoria(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CategoriaDto,
  ) {
    await this.exigirTodo(user);
    return this.tarifas.editarCategoria(companyId, id, dto);
  }

  @Put('personas/:userId')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  async asignarPersona(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: PersonaDto,
  ) {
    await this.exigirTodo(user);
    return this.tarifas.asignarPersona(companyId, userId, dto);
  }

  @Post('fichas')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  async crearFicha(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Body() dto: FichaDto) {
    const actor = await this.exigirTodo(user);
    return this.tarifas.crearFicha(companyId, dto, actor.id);
  }

  @Patch('fichas/:id')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  async editarFicha(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FichaDto,
  ) {
    const actor = await this.exigirTodo(user);
    return this.tarifas.editarFicha(companyId, id, dto, actor.id);
  }

  @Delete('fichas/:id')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  async quitarFicha(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const actor = await this.exigirTodo(user);
    return this.tarifas.quitarFicha(companyId, id, actor.id);
  }

  /* ── Libro ────────────────────────────────────────────────────────────── */

  /** Volver a calcular: después de cambiar tarifas, sin esperar a la noche. */
  @Post('recalcular')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  async recalcular(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    await this.exigirTodo(user);
    return this.libro.sincronizar(requireCompanyId(companyId));
  }

  /* ── Bandeja de horas sin proyecto ────────────────────────────────────── */

  @Get('por-ligar')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  async porLigar(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('periodo') periodo?: string,
  ) {
    await this.exigirLigar(user);
    return this.liga.porLigar(companyId, this.periodo(periodo));
  }

  @Post('por-ligar/sugerir')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  async sugerir(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Body() dto: SugerirDto) {
    await this.exigirLigar(user);
    return this.liga.sugerirConIa(companyId, this.periodo(dto?.periodo));
  }

  @Post('por-ligar/:activityId')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  async ligar(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('activityId', ParseIntPipe) activityId: number,
    @Body() dto: LigarDto,
  ) {
    const actor = await this.exigirLigar(user);
    if (dto.tipo !== 'INTERNA' && !dto.id) throw new BadRequestException('Elige a qué se liga');
    return this.liga.decidir(companyId, activityId, dto, actor.id);
  }

  @Delete('por-ligar/:activityId')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  async deshacer(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('activityId', ParseIntPipe) activityId: number,
  ) {
    await this.exigirLigar(user);
    return this.liga.deshacer(companyId, activityId);
  }

  /* ── Por proyecto ─────────────────────────────────────────────────────── */

  @Get('proyectos')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  async lista(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.proyectos.lista(companyId, await this.actor(user));
  }

  @Get('proyectos/:id')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  async proyecto(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.proyectos.proyecto(companyId, id, await this.actor(user));
  }
}
