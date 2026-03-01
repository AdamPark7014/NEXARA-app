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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { VentasService } from './ventas.service.js';
import { CreateSalesClientDto } from './dto/create-sales-client.dto.js';
import { UpdateSalesClientDto } from './dto/update-sales-client.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';

const SALES_VIEW_ACCESS = [PERMISSIONS.SALES_VIEW, PERMISSIONS.PANEL_VENTAS];
const SALES_MANAGE_ACCESS = [PERMISSIONS.SALES_MANAGE, PERMISSIONS.PANEL_VENTAS];

@Controller('ventas/clientes')
export class VentasClientesController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async create(@Body() dto: CreateSalesClientDto, @CurrentUser() user: any) {
    const created = await this.ventasService.createClient(dto, user);
    await this.ventasService.createAuditEvent({
      action: 'client.create',
      entityType: 'client',
      entityId: created.id,
      actorId: user?.id,
      metadata: { name: created.name },
    });
    return created;
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  findAll(@CurrentUser() user: any) {
    return this.ventasService.listClients(user);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.getClient(id, user);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSalesClientDto, @CurrentUser() user: any) {
    const updated = await this.ventasService.updateClient(id, dto, user);
    await this.ventasService.createAuditEvent({
      action: 'client.update',
      entityType: 'client',
      entityId: updated.id,
      actorId: user?.id,
      metadata: { name: updated.name },
    });
    return updated;
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    const removed = await this.ventasService.deleteClient(id, user);
    await this.ventasService.createAuditEvent({
      action: 'client.delete',
      entityType: 'client',
      entityId: removed.id,
      actorId: user?.id,
    });
    return removed;
  }

  @Post(':id/documentos')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  @UseInterceptors(FilesInterceptor('files', 10, { dest: 'apps/api/uploads/sales-docs' }))
  async uploadDocuments(
    @Param('id', ParseIntPipe) id: number,
    @Body('type') type: string,
    @UploadedFiles() files: any[],
    @CurrentUser() user: any,
  ) {
    if (!type || !type.trim()) throw new BadRequestException('Tipo de documento requerido');
    if (!files || files.length === 0) throw new BadRequestException('No hay archivos');
    const invalid = files.find((file) => {
      const name = (file.originalname || '').toLowerCase();
      const isPdf = (file.mimetype || '').includes('pdf') || name.endsWith('.pdf');
      return !isPdf;
    });
    if (invalid) throw new BadRequestException('Solo se permiten archivos PDF');

    const payload = files.map((file) => ({
      url: `/uploads/sales-docs/${file.filename}`,
      name: file.originalname,
    }));
    const result = await this.ventasService.addClientDocuments(id, type.trim(), payload, user);
    await this.ventasService.createAuditEvent({
      action: 'client.document.upload',
      entityType: 'client',
      entityId: id,
      actorId: user?.id,
      metadata: { type: type.trim(), count: payload.length },
    });
    return result;
  }
}
