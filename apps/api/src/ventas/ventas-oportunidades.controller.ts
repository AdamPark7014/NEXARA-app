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
import { CurrentUser } from '../common/current-user.decorator.js';

@Controller('ventas/oportunidades')
export class VentasOportunidadesController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  create(@Body() dto: CreateSalesOpportunityDto, @CurrentUser() user: any) {
    return this.ventasService.createOpportunity(dto, user);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  findAll(@CurrentUser() user: any) {
    return this.ventasService.listOpportunities(user);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.getOpportunity(id, user);
  }

  @Get(':id/cotizaciones')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  listQuotes(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.listOpportunityQuotes(id, user);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSalesOpportunityDto, @CurrentUser() user: any) {
    return this.ventasService.updateOpportunity(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.deleteOpportunity(id, user);
  }

  @Post(':id/notas')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  addNote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateSalesOpportunityNoteDto,
    @CurrentUser() user: any,
  ) {
    return this.ventasService.addOpportunityNote(id, dto, user);
  }

  @Post(':id/evidencias')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  @UseInterceptors(FilesInterceptor('files', 15, { dest: 'apps/api/uploads/sales-evidences' }))
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

    return this.ventasService.addOpportunityEvidence(id, payload, user);
  }

  @Post(':id/cotizaciones')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  addQuote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateSalesOpportunityQuoteDto,
    @CurrentUser() user: any,
  ) {
    return this.ventasService.addOpportunityQuote(id, dto, user);
  }

  @Post(':id/cotizaciones/archivo')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  @UseInterceptors(FileInterceptor('file', { dest: 'apps/api/uploads/sales-quotes' }))
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
    return this.ventasService.addOpportunityQuote(id, payload, user);
  }
}
