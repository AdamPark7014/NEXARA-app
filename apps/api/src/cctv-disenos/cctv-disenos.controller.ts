import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { PERMISSIONS } from '../common/permissions.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { FileInterceptor } from '../common/files/interceptores-subida.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { StaffOnlyGuard } from '../common/security/staff-only.guard.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { requireCompanyId } from '../common/tenant/tenant-scope.js';
import { CctvDisenosService, type ActorCctv } from './cctv-disenos.service.js';
import { ConflictoVersionFilter } from './conflicto-version.js';
import { CROQUIS_MAX_BYTES } from './croquis-imagen.js';
import { validarModelos } from './existencias.js';
import { ExistenciasCctvService } from './existencias.service.js';
import { CrearDisenoDto } from './dto/crear-diseno.dto.js';
import { GuardarDisenoDto } from './dto/guardar-diseno.dto.js';
import { FICHA_MAX_BYTES, LecturaFichaService } from './lectura-ficha.service.js';

/**
 * Diseñador de videovigilancia (`docs/DISENADOR-CCTV.md` §9).
 *
 * La matriz de URLs abre el camino a los encargados y a quienes podrían llevar gente
 * (`CCTV_DISENOS_URL_RULES`); quién entra de verdad lo decide el servicio con `puedeDisenarCctv`
 * (403 con el motivo). `GET acceso` es la excepción: todo el personal la consulta y nunca da 403.
 */
@Controller('cctv-disenos')
@UseGuards(UrlAccessGuard, StaffOnlyGuard)
@UseFilters(ConflictoVersionFilter)
export class CctvDisenosController {
  constructor(
    private readonly service: CctvDisenosService,
    private readonly lectura: LecturaFichaService,
    private readonly existencias: ExistenciasCctvService,
  ) {}

  /** `{ puede }`: la web decide con esto si muestra el módulo. Antes de `:id`. */
  @Get('acceso')
  acceso(@Req() req: any) {
    return this.service.acceso(this.actor(req));
  }

  /** Catálogo de equipos que agregó la empresa. Sus rutas van antes de `:id`. */
  @Get('catalogo')
  catalogo(@Req() req: any, @CurrentCompanyId() companyId: number | null) {
    return this.service.catalogo(this.actor(req), companyId);
  }

  @Post('catalogo')
  agregarAlCatalogo(@Req() req: any, @Body() cuerpo: unknown, @CurrentCompanyId() companyId: number | null) {
    return this.service.agregarAlCatalogo(this.actor(req), cuerpo, companyId);
  }

  /** Multipart `file`: la memoria técnica en PDF. Devuelve lo leído; no guarda ni el PDF ni los datos. */
  @Post('catalogo/leer-ficha')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: FICHA_MAX_BYTES + 1024 * 1024, files: 1 } }))
  async leerFicha(@Req() req: any, @UploadedFile() file: any, @CurrentCompanyId() companyId: number | null) {
    await this.service.exigirAcceso(this.actor(req));
    return this.lectura.leer(requireCompanyId(companyId), file);
  }

  /** Un equipo a partir de una frase, para quien no tiene su PDF. Tampoco guarda nada. */
  @Post('catalogo/describir')
  @HttpCode(200)
  async describirEquipo(@Req() req: any, @Body() cuerpo: { frase?: unknown }, @CurrentCompanyId() companyId: number | null) {
    await this.service.exigirAcceso(this.actor(req));
    return this.lectura.equipoDesdeFrase(requireCompanyId(companyId), cuerpo?.frase);
  }

  /** Los datos de un sitio a partir de una frase. El diseño lo arma la web con ellos. */
  @Post('generar-sitio')
  @HttpCode(200)
  async generarSitio(@Req() req: any, @Body() cuerpo: { frase?: unknown }, @CurrentCompanyId() companyId: number | null) {
    await this.service.exigirAcceso(this.actor(req));
    return this.lectura.sitioDesdeFrase(requireCompanyId(companyId), cuerpo?.frase);
  }

  /** Cuántas hay de cada modelo, en Almacén y en CT, y a qué precio. Solo lee. */
  @Post('catalogo/disponibilidad')
  @HttpCode(200)
  async disponibilidad(@Req() req: any, @Body() cuerpo: { modelos?: unknown }, @CurrentCompanyId() companyId: number | null) {
    await this.service.exigirAcceso(this.actor(req));
    return { modelos: await this.existencias.disponibilidad(requireCompanyId(companyId), validarModelos(cuerpo?.modelos)) };
  }

  @Get('catalogo/buscar-ct')
  async buscarCt(@Req() req: any, @Query('q') q?: string, @Query('sub') sub?: string) {
    await this.service.exigirAcceso(this.actor(req));
    return this.existencias.buscarCt(q, sub);
  }

  /** Un producto de CT como ficha para revisar. No guarda nada. */
  @Post('catalogo/desde-ct')
  @HttpCode(200)
  async desdeCt(@Req() req: any, @Body() cuerpo: { clave?: unknown }, @CurrentCompanyId() companyId: number | null) {
    await this.service.exigirAcceso(this.actor(req));
    return this.existencias.fichaDesdeCt(requireCompanyId(companyId), cuerpo?.clave);
  }

  @Post('catalogo/alta-almacen')
  @HttpCode(200)
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CATALOG_MANAGE] })
  async altaAlmacen(@Req() req: any, @Body() cuerpo: Record<string, unknown>, @CurrentCompanyId() companyId: number | null) {
    await this.service.exigirAcceso(this.actor(req));
    return this.existencias.altaEnAlmacen(requireCompanyId(companyId), cuerpo);
  }

  @Patch('catalogo/:id')
  editarCatalogo(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() cuerpo: unknown,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.editarCatalogo(this.actor(req), id, cuerpo, companyId);
  }

  @Post('catalogo/:id/archivar')
  @HttpCode(200)
  archivarDelCatalogo(@Req() req: any, @Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.service.archivarDelCatalogo(this.actor(req), id, companyId);
  }

  @Get()
  listar(@Req() req: any, @CurrentCompanyId() companyId: number | null) {
    return this.service.listar(this.actor(req), companyId);
  }

  @Post()
  crear(@Req() req: any, @Body() dto: CrearDisenoDto, @CurrentCompanyId() companyId: number | null) {
    return this.service.crear(this.actor(req), dto, companyId);
  }

  @Get(':id')
  detalle(@Req() req: any, @Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.service.detalle(this.actor(req), id, companyId);
  }

  @Patch(':id')
  guardar(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GuardarDisenoDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.guardar(this.actor(req), id, dto, companyId);
  }

  /** «Pasar a cotización»: crea o actualiza la cotización del diseño. El precio lo pone el servidor. */
  @Post(':id/cotizacion')
  @HttpCode(200)
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  async pasarACotizacion(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() cuerpo: { lineas?: unknown; nueva?: unknown }, @CurrentCompanyId() companyId: number | null) {
    const actor = this.actor(req);
    await this.service.exigirAcceso(actor);
    return this.existencias.pasarACotizacion({ id: actor.id, email: actor.email, roleKey: actor.roleKey, nombre: req?.user?.nombre ?? null }, id, cuerpo, requireCompanyId(companyId));
  }

  /** Multipart `file`: el plano en imagen, que la pantalla saca de lo que ya dibujó. */
  @Post(':id/cotizacion/plano')
  @HttpCode(200)
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 21 * 1024 * 1024, files: 1 } }))
  async adjuntarPlano(@Req() req: any, @Param('id', ParseIntPipe) id: number, @UploadedFile() file: any, @Body() cuerpo: { nombre?: unknown }, @CurrentCompanyId() companyId: number | null) {
    await this.service.exigirAcceso(this.actor(req));
    return this.existencias.adjuntarPlano(id, file, cuerpo?.nombre, requireCompanyId(companyId));
  }

  @Post(':id/archivar')
  @HttpCode(200)
  archivar(@Req() req: any, @Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.service.archivar(this.actor(req), id, companyId);
  }

  /** Multipart `file`: PNG, JPEG o WebP hasta 20 MB (multer corta a los 25 MB). */
  @Post(':id/croquis')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CROQUIS_MAX_BYTES + 5 * 1024 * 1024, files: 1 } }))
  subirCroquis(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.subirCroquis(this.actor(req), id, file, companyId);
  }

  /** El rol que resolvió `UrlAccessGuard` (también para claves legacy); si no, el del JWT. */
  private actor(req: any): ActorCctv {
    const u = req?.user ?? {};
    return {
      id: Number(u.id),
      roleKey: req?.rbac?.role ?? u.roleKey ?? null,
      isSuperAdmin: Boolean(u.isSuperAdmin || u.superadmin),
      email: u.email ?? null,
    };
  }
}
