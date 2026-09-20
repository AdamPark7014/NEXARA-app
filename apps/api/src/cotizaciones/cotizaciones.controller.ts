import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { CotizacionesService } from './cotizaciones.service.js';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto.js';
import { UpdateCotizacionDto } from './dto/update-cotizacion.dto.js';
import { SendCotizacionDto } from './dto/send-cotizacion.dto.js';
import { SignCotizacionDto } from './dto/sign-cotizacion.dto.js';
import { AgregarPaqueteDto, LigarActividadDto, RechazarCotizacionDto } from './dto/rechazar-cotizacion.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { validarTamanoBorrador } from './propuesta-vista-previa.js';
import { GuardarPlantillaDto } from './dto/plantilla-cotizacion.dto.js';

@Controller('cotizaciones')
@UseGuards(UrlAccessGuard)
export class CotizacionesController {
  constructor(private readonly cotizacionesService: CotizacionesService) {}

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Post()
  create(
    @CurrentUser() user: any,
    @Body() dto: CreateCotizacionDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.create(dto, user?.id, companyId);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Get()
  findAll(@Query() query: PaginationQueryDto, @CurrentCompanyId() companyId: number | null) {
    return this.cotizacionesService.findAll(query, companyId);
  }

  /**
   * Lista de Core: folio, cliente, segmento, estado, total y quién intervino.
   * Va **antes** de `:id` para que Nest no la trate como un id.
   */
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Get('core')
  listaCore(@Query() query: PaginationQueryDto, @CurrentCompanyId() companyId: number | null) {
    return this.cotizacionesService.listaCore(query, companyId);
  }

  /** Catálogo de paquetes. Antes de `:id` para que no lo tome por un id. */
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_VIEW] })
  @Get('paquetes')
  paquetes() {
    return this.cotizacionesService.paquetes();
  }

  /** Plantillas del editor por segmento (objetivo y subsecciones de alcance). Antes de `:id`. */
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_VIEW] })
  @Get('plantillas')
  plantillas() {
    return this.cotizacionesService.plantillas();
  }

  /**
   * Plantillas de cotización de la empresa («Nueva desde plantilla»). Van antes de `:id` para que
   * Nest no tome «plantillas-guardadas» por un id.
   */
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Get('plantillas-guardadas')
  listarPlantillasGuardadas(@CurrentCompanyId() companyId: number | null) {
    return this.cotizacionesService.listarPlantillasGuardadas(companyId);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Get('plantillas-guardadas/:plantillaId')
  plantillaGuardada(
    @Param('plantillaId', ParseIntPipe) plantillaId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.plantillaGuardada(plantillaId, companyId);
  }

  /** «Guardar como plantilla»: de la cotización guardada, sin cliente ni folio. */
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Post('plantillas-guardadas')
  guardarPlantilla(
    @CurrentUser() user: any,
    @Body() dto: GuardarPlantillaDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.guardarPlantilla(dto, user?.id, companyId);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Post('plantillas-guardadas/:plantillaId/archivar')
  archivarPlantilla(
    @Param('plantillaId', ParseIntPipe) plantillaId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.archivarPlantilla(plantillaId, companyId);
  }

  /** Detalle de Core: estado y segmento en español, términos, partidas agrupadas y participantes. */
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Get('core/:id')
  detalleCore(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.detalleCore(id, companyId);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.findOne(id, companyId);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Put(':id')
  update(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCotizacionDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.update(id, dto, user?.id, companyId);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Post(':id/send')
  send(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendCotizacionDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.send(id, dto, user?.id, companyId);
  }

  @UseGuards(RbacGuard)
  // Quien puede ver la cotización (SALES_VIEW) también puede descargar su PDF
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_VIEW, PERMISSIONS.PANEL_VENTAS] })
  @Get(':id/pdf')
  async downloadPdf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
  ) {
    const pdf = await this.cotizacionesService.getPdfBuffer(id, companyId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=cotizacion-${id}.pdf`);
    res.send(pdf);
  }

  /**
   * Vista previa en vivo: el PDF del borrador que está en pantalla, sin guardarlo.
   *
   * Cuerpo: lo mismo que `PUT /cotizaciones/:id` (`UpdateCotizacionDto`, con las mismas reglas de
   * validación); se mezcla en memoria con la guardada. Mismo permiso y mismo candado de empresa que
   * `GET :id/pdf`. Responde el PDF y, en `X-Propuesta-Secciones`, la página donde empieza cada
   * sección (`{"portada":1,"objetivo":2,…}`) para que el editor siga al cursor.
   */
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_VIEW, PERMISSIONS.PANEL_VENTAS] })
  @Post(':id/pdf/vista-previa')
  @HttpCode(200)
  async vistaPreviaPdf(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCotizacionDto,
    @CurrentCompanyId() companyId: number | null,
    @Req() req: Request & { rawBody?: Buffer },
    @Res() res: Response,
  ) {
    validarTamanoBorrador(dto, req.rawBody?.length ?? Number(req.headers['content-length'] ?? 0));
    const { pdf, secciones } = await this.cotizacionesService.vistaPreviaPdf(id, dto, companyId, user?.id ?? null);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=vista-previa-${id}.pdf`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Propuesta-Secciones', JSON.stringify(secciones));
    res.send(pdf);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Get(':id/pdf/internal')
  async downloadInternalPdf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
  ) {
    const pdf = await this.cotizacionesService.getInternalPdfBuffer(id, companyId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=cotizacion-${id}-interno.pdf`);
    res.send(pdf);
  }

  /** Quién intervino y con qué papel (línea de tiempo de la web). */
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_VIEW] })
  @Get(':id/participantes')
  participantes(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.participantes(id, companyId);
  }

  /** Versiones guardadas: cada edición sobre una enviada deja una. */
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.COTIZACIONES_ACCESS, PERMISSIONS.SALES_VIEW] })
  @Get(':id/versiones')
  versiones(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.versiones(id, companyId);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Post(':id/revisar')
  revisar(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.revisar(id, user?.id, companyId);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Post(':id/aprobar')
  aprobar(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.aprobar(id, user?.id, companyId);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Post(':id/rechazar')
  rechazar(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RechazarCotizacionDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.rechazar(id, dto.motivo, {
      porNombre: dto.nombre ?? user?.nombre ?? null,
      userId: user?.id,
      companyId,
    });
  }

  /** Borrador viejo sin nomenclatura → folio de quien la hizo (el anterior queda en versiones). */
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Post(':id/refoliar')
  refoliar(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.refoliar(id, user?.id, companyId);
  }

  /** 03 Planos: sube un plano o anexo propio de la cotización. */
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @UseInterceptors(FileInterceptor('file'))
  @Post(':id/planos')
  subirPlano(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: any,
    @Body() body: { nombre?: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.agregarPlano(id, file, body?.nombre, companyId);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Post(':id/planos/quitar')
  quitarPlano(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { url: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.quitarPlano(id, String(body?.url ?? ''), companyId);
  }

  /** Agrega N paquetes: genera las partidas y cuadra el alcance. */
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Post(':id/paquetes')
  agregarPaquete(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AgregarPaqueteDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.agregarPaquete(id, dto.clave, dto.cantidad, user?.id, companyId);
  }

  /** «Ligar cotización» desde la actividad comercial (o desde la cotización). */
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.COTIZACIONES_ACCESS] })
  @Post(':id/actividad')
  ligarActividad(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LigarActividadDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.cotizacionesService.ligarActividad(id, dto.activityId, companyId);
  }

  @Get('public/:token')
  getPublic(@Param('token') token: string) {
    return this.cotizacionesService.getPublicByToken(token);
  }

  @Post('public/:token/sign')
  signPublic(@Param('token') token: string, @Body() dto: SignCotizacionDto) {
    return this.cotizacionesService.signByToken(token, dto);
  }

  /** El cliente rechaza con motivo desde el enlace, sin tener que escribir un correo. */
  @Post('public/:token/rechazar')
  rechazarPublic(@Param('token') token: string, @Body() dto: RechazarCotizacionDto) {
    return this.cotizacionesService.rechazarPorToken(token, dto.motivo, dto.nombre);
  }
}
