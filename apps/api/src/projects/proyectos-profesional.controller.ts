/**
 * `/proyectos`: el proyecto completo (plan, alcance, requerimientos, equipo y documentos).
 *
 * Convive con `/operational-projects`, que sigue llevando el espejo comercial, los
 * ingenieros y las actividades por sitio. El cambio de estado reutiliza la regla de allá
 * (transiciones, pausa y cancelación con permiso) para que no haya dos versiones.
 */
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
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { getUploadSubdir } from '../common/upload-paths.js';
import { ProyectosProfesionalService } from './proyectos-profesional.service.js';
import { OperationalProjectsService } from './operational-projects.service.js';
import {
  ActualizarProyectoProfesionalDto,
  CambiarEstadoProyectoDto,
  CrearProyectoProfesionalDto,
  ProjectDocumentMetaDto,
  ProjectMemberInputDto,
  ProjectMilestoneInputDto,
  ProjectRequirementInputDto,
  ProjectScopeItemInputDto,
  UpdateProjectMemberDto,
  UpdateProjectMilestoneDto,
  UpdateProjectRequirementDto,
  UpdateProjectScopeItemDto,
} from './dto/proyecto-profesional.dto.js';

const DOCS_SUBDIR = 'project-docs';
const MAX_DOC_BYTES = 25 * 1024 * 1024;

/** Nombre en disco: único y sin nada que permita salirse de la carpeta. */
function nombreEnDisco(original: string): string {
  const ext = path.extname(original || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
}

@Controller('proyectos')
@UseGuards(RbacGuard)
export class ProyectosProfesionalController {
  constructor(
    private readonly proyectos: ProyectosProfesionalService,
    private readonly operativos: OperationalProjectsService,
  ) {}

  private numero(valor?: string): number | undefined {
    if (valor === undefined || valor === null || valor === '') return undefined;
    const n = Number(valor);
    if (!Number.isInteger(n)) throw new BadRequestException(`Número inválido: ${valor}`);
    return n;
  }

  private actor(user: any) {
    return { id: Number(user?.id), isSuperAdmin: Boolean(user?.isSuperAdmin) };
  }

  // ---------------------------------------------------------------------------
  // Lectura
  // ---------------------------------------------------------------------------

  @Get()
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  listar(
    @CurrentCompanyId() companyId: number | null,
    @Query('clientId') clientId?: string,
    @Query('vendorId') vendorId?: string,
    @Query('responsableId') responsableId?: string,
    @Query('status') status?: string,
    @Query('salud') salud?: string,
    @Query('q') q?: string,
    @Query('incluirCancelados') incluirCancelados?: string,
  ) {
    return this.proyectos.listar(
      {
        clientId: this.numero(clientId),
        vendorId: this.numero(vendorId),
        responsableId: this.numero(responsableId),
        status,
        salud,
        q,
        incluirCancelados: incluirCancelados === '1' || incluirCancelados === 'true',
      },
      companyId,
    );
  }

  @Get('vocabulario')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  vocabulario() {
    return this.proyectos.vocabulario();
  }

  @Get(':id')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  detalle(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.proyectos.detalle(id, companyId);
  }

  // ---------------------------------------------------------------------------
  // Alta, cabecera y estado
  // ---------------------------------------------------------------------------

  @Post()
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  crear(
    @Body() dto: CrearProyectoProfesionalDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.proyectos.crear(dto, this.actor(user), companyId);
  }

  @Patch(':id')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarProyectoProfesionalDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.proyectos.actualizar(id, dto, this.actor(user), companyId);
  }

  /** Misma regla que `/operational-projects/:id/status`; devuelve el proyecto completo. */
  @Patch(':id/estado')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  async cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoProyectoDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    await this.operativos.changeStatus(id, dto as any, companyId, user);
    return this.proyectos.detalle(id, companyId);
  }

  // ---------------------------------------------------------------------------
  // Cronograma
  // ---------------------------------------------------------------------------

  @Post(':id/hitos')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  agregarHito(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ProjectMilestoneInputDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.proyectos.agregarHito(id, dto, this.actor(user), companyId);
  }

  @Patch(':id/hitos/:hitoId')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  actualizarHito(
    @Param('id', ParseIntPipe) id: number,
    @Param('hitoId', ParseIntPipe) hitoId: number,
    @Body() dto: UpdateProjectMilestoneDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.proyectos.actualizarHito(id, hitoId, dto, this.actor(user), companyId);
  }

  @Delete(':id/hitos/:hitoId')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  borrarHito(
    @Param('id', ParseIntPipe) id: number,
    @Param('hitoId', ParseIntPipe) hitoId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.proyectos.borrarHito(id, hitoId, companyId);
  }

  // ---------------------------------------------------------------------------
  // Alcance
  // ---------------------------------------------------------------------------

  @Post(':id/alcance')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  agregarAlcance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ProjectScopeItemInputDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.proyectos.agregarAlcance(id, dto, companyId);
  }

  @Post(':id/alcance/importar-cotizacion')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  importarAlcance(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.proyectos.importarAlcanceDeCotizacion(id, companyId);
  }

  @Patch(':id/alcance/:itemId')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  actualizarAlcance(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdateProjectScopeItemDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.proyectos.actualizarAlcance(id, itemId, dto, companyId);
  }

  @Delete(':id/alcance/:itemId')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  borrarAlcance(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.proyectos.borrarAlcance(id, itemId, companyId);
  }

  // ---------------------------------------------------------------------------
  // Requerimientos
  // ---------------------------------------------------------------------------

  @Post(':id/requerimientos')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  agregarRequerimiento(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ProjectRequirementInputDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.proyectos.agregarRequerimiento(id, dto, this.actor(user), companyId);
  }

  @Patch(':id/requerimientos/:reqId')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  actualizarRequerimiento(
    @Param('id', ParseIntPipe) id: number,
    @Param('reqId', ParseIntPipe) reqId: number,
    @Body() dto: UpdateProjectRequirementDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.proyectos.actualizarRequerimiento(id, reqId, dto, this.actor(user), companyId);
  }

  @Delete(':id/requerimientos/:reqId')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  borrarRequerimiento(
    @Param('id', ParseIntPipe) id: number,
    @Param('reqId', ParseIntPipe) reqId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.proyectos.borrarRequerimiento(id, reqId, companyId);
  }

  // ---------------------------------------------------------------------------
  // Equipo
  // ---------------------------------------------------------------------------

  @Post(':id/equipo')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  agregarMiembro(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ProjectMemberInputDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.proyectos.agregarMiembro(id, dto, this.actor(user), companyId);
  }

  @Patch(':id/equipo/:userId')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  actualizarMiembro(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateProjectMemberDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.proyectos.actualizarMiembro(id, userId, dto, companyId);
  }

  @Delete(':id/equipo/:userId')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  quitarMiembro(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.proyectos.quitarMiembro(id, userId, companyId);
  }

  // ---------------------------------------------------------------------------
  // Documentos
  // ---------------------------------------------------------------------------

  @Post(':id/documentos')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, getUploadSubdir(__dirname, DOCS_SUBDIR)),
        filename: (_req, file, cb) => cb(null, nombreEnDisco(file.originalname)),
      }),
      limits: { fileSize: MAX_DOC_BYTES },
    }),
  )
  agregarDocumentos(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: any[],
    @Body() meta: ProjectDocumentMetaDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (!files?.length) throw new BadRequestException('Adjunta al menos un archivo');
    const archivos = files.map((f) => ({
      url: `/uploads/${DOCS_SUBDIR}/${f.filename}`,
      // Con un solo archivo, el nombre que escribió la persona gana al del disco.
      nombre: (files.length === 1 && meta.nombre?.trim()) || f.originalname || f.filename,
      mimeType: f.mimetype ?? null,
      size: typeof f.size === 'number' ? f.size : null,
    }));
    return this.proyectos.agregarDocumentos(id, archivos, meta.kind, user?.id ?? null, companyId);
  }

  @Delete(':id/documentos/:docId')
  @RBAC({ permissions: [PERMISSIONS.ACTIVITIES_MANAGE] })
  borrarDocumento(
    @Param('id', ParseIntPipe) id: number,
    @Param('docId', ParseIntPipe) docId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.proyectos.borrarDocumento(id, docId, companyId);
  }
}
