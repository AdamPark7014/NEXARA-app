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
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { VentasService } from './ventas.service.js';
import { CreateSalesOpportunityDto } from './dto/create-sales-opportunity.dto.js';
import { UpdateSalesOpportunityDto } from './dto/update-sales-opportunity.dto.js';
import { CreateSalesOpportunityNoteDto } from './dto/create-sales-opportunity-note.dto.js';
import { CreateSalesOpportunityQuoteDto } from './dto/create-sales-opportunity-quote.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { getUploadSubdir } from '../common/upload-paths.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { SalesPaginationQueryDto } from './dto/sales-pagination-query.dto.js';

const SALES_VIEW_ACCESS = [PERMISSIONS.SALES_VIEW, PERMISSIONS.PANEL_VENTAS];
const SALES_MANAGE_ACCESS = [PERMISSIONS.SALES_MANAGE, PERMISSIONS.PANEL_VENTAS];

@Controller('ventas/oportunidades')
export class VentasOportunidadesController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async create(@Body() dto: CreateSalesOpportunityDto, @CurrentUser() user: any) {
    const created = await this.ventasService.createOpportunity(dto, user);
    await this.ventasService.createAuditEvent({
      action: 'opportunity.create',
      entityType: 'opportunity',
      entityId: created.id,
      actorId: user?.id,
      metadata: { stage: created.stage, value: created.value },
    });
    return created;
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  findAll(@CurrentUser() user: any, @Query() query: SalesPaginationQueryDto) {
    return this.ventasService.listOpportunities(user, query.ownerId, query);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.getOpportunity(id, user);
  }

  @Get(':id/cotizaciones')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  listQuotes(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.listOpportunityQuotes(id, user);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSalesOpportunityDto, @CurrentUser() user: any) {
    const updated = await this.ventasService.updateOpportunity(id, dto, user);
    await this.ventasService.createAuditEvent({
      action: dto?.stage ? 'opportunity.stage.update' : 'opportunity.update',
      entityType: 'opportunity',
      entityId: updated.id,
      actorId: user?.id,
      metadata: { stage: updated.stage, probability: updated.probability },
    });
    return updated;
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    const removed = await this.ventasService.deleteOpportunity(id, user);
    await this.ventasService.createAuditEvent({
      action: 'opportunity.delete',
      entityType: 'opportunity',
      entityId: removed.id,
      actorId: user?.id,
    });
    return removed;
  }

  @Post(':id/notas')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  addNote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateSalesOpportunityNoteDto,
    @CurrentUser() user: any,
  ) {
    return this.ventasService.addOpportunityNote(id, dto, user).then(async (note) => {
      await this.ventasService.createAuditEvent({
        action: 'opportunity.note.add',
        entityType: 'opportunity',
        entityId: id,
        actorId: user?.id,
        metadata: { noteId: note.id },
      });
      return note;
    });
  }

  @Post(':id/evidencias')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  @UseInterceptors(FilesInterceptor('files', 15, { dest: getUploadSubdir(__dirname, 'sales-evidences') }))
  async addEvidence(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: any[],
    @CurrentUser() user: any,
  ) {
    if (!files || files.length === 0) throw new BadRequestException('No hay archivos');
    const invalid = files.find((file) => {
      const name = (file.originalname || '').toLowerCase();
      const isPdf = (file.mimetype || '').includes('pdf') || name.endsWith('.pdf');
      const isImage = (file.mimetype || '').startsWith('image/');
      return !isPdf && !isImage;
    });
    if (invalid) throw new BadRequestException('Solo se permiten imagenes o PDF');

    const payload = files.map((file) => ({
      url: `/uploads/sales-evidences/${file.filename}`,
      name: file.originalname,
      kind: (file.mimetype || '').includes('pdf') ? 'pdf' : 'image',
    }));

    const evidences = await this.ventasService.addOpportunityEvidence(id, payload, user);
    await this.ventasService.createAuditEvent({
      action: 'opportunity.evidence.add',
      entityType: 'opportunity',
      entityId: id,
      actorId: user?.id,
      metadata: { count: payload.length },
    });
    return evidences;
  }

  @Post(':id/cotizaciones')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  addQuote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateSalesOpportunityQuoteDto,
    @CurrentUser() user: any,
  ) {
    return this.ventasService.addOpportunityQuote(id, dto, user).then(async (quote) => {
      await this.ventasService.createAuditEvent({
        action: 'opportunity.quote.add',
        entityType: 'opportunity',
        entityId: id,
        actorId: user?.id,
        metadata: { quoteId: quote.id },
      });
      return quote;
    });
  }

  @Post(':id/cotizaciones/archivo')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  @UseInterceptors(FileInterceptor('file', { dest: getUploadSubdir(__dirname, 'sales-quotes') }))
  async addQuoteFile(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: any,
    @Body('versionLabel') versionLabel: string,
    @CurrentUser() user: any,
  ) {
    if (!file) throw new BadRequestException('Archivo requerido');
    const name = (file.originalname || '').toLowerCase();
    const isPdf = (file.mimetype || '').includes('pdf') || name.endsWith('.pdf');
    if (!isPdf) throw new BadRequestException('Solo se permite PDF');
    const payload = {
      pdfUrl: `/uploads/sales-quotes/${file.filename}`,
      versionLabel: versionLabel?.trim() || undefined,
    };
    const quote = await this.ventasService.addOpportunityQuote(id, payload, user);
    await this.ventasService.createAuditEvent({
      action: 'opportunity.quote.upload',
      entityType: 'opportunity',
      entityId: id,
      actorId: user?.id,
      metadata: { quoteId: quote.id },
    });
    return quote;
  }
}
