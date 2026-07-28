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
import { AuthGuard } from '@nestjs/passport';
import { VentasService } from './ventas.service.js';
import { CreateSalesClientDto } from './dto/create-sales-client.dto.js';
import { UpdateSalesClientDto } from './dto/update-sales-client.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { SalesPaginationQueryDto } from './dto/sales-pagination-query.dto.js';
import { getUploadSubdir } from '../common/upload-paths.js';

const SALES_VIEW_ACCESS = [PERMISSIONS.SALES_VIEW, PERMISSIONS.PANEL_VENTAS];
const SALES_MANAGE_ACCESS = [PERMISSIONS.SALES_MANAGE, PERMISSIONS.PANEL_VENTAS];

@Controller('ventas/clientes')
export class VentasClientesController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async create(
    @Body() dto: CreateSalesClientDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const created = await this.ventasService.createClient(dto, user, companyId);
    await this.ventasService.createAuditEvent({
      action: 'client.create',
      entityType: 'client',
      entityId: created.id,
      actorId: user?.id,
      companyId,
      metadata: { name: created.name },
    });
    return created;
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  findAll(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query() query: SalesPaginationQueryDto,
  ) {
    return this.ventasService.listClients(user, query.ownerId, query, companyId);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.ventasService.getClient(id, user, companyId);
  }

  @Get(':id/facturas')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({
    anyPermissions: [
      PERMISSIONS.SALES_VIEW,
      PERMISSIONS.PANEL_VENTAS,
      PERMISSIONS.INVOICING_VIEW,
      PERMISSIONS.CONTABILIDAD_VIEW,
    ],
  })
  listFacturas(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.ventasService.listClientInvoices(id, user, companyId);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalesClientDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const updated = await this.ventasService.updateClient(id, dto, user, companyId);
    await this.ventasService.createAuditEvent({
      action: 'client.update',
      entityType: 'client',
      entityId: updated.id,
      actorId: user?.id,
      companyId,
      metadata: { name: updated.name },
    });
    return updated;
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const removed = await this.ventasService.deleteClient(id, user, companyId);
    await this.ventasService.createAuditEvent({
      action: 'client.delete',
      entityType: 'client',
      entityId: removed.id,
      actorId: user?.id,
      companyId,
    });
    return removed;
  }

  @Post(':id/provision-service-client')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async provisionServiceClient(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const result = await this.ventasService.provisionServiceClient(id, user, companyId);
    await this.ventasService.createAuditEvent({
      action: 'client.provision_service',
      entityType: 'client',
      entityId: id,
      actorId: user?.id,
      companyId,
      metadata: {
        serviceClientId: result.serviceClient.id,
        created: result.created,
      },
    });
    return result;
  }

  @Post(':id/documentos')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  @UseInterceptors(FilesInterceptor('files', 10, { dest: getUploadSubdir(__dirname, 'sales-docs') }))
  async uploadDocuments(
    @Param('id', ParseIntPipe) id: number,
    @Body('type') type: string,
    @UploadedFiles() files: any[],
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
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
    const result = await this.ventasService.addClientDocuments(id, type.trim(), payload, user, companyId);
    await this.ventasService.createAuditEvent({
      action: 'client.document.upload',
      entityType: 'client',
      entityId: id,
      actorId: user?.id,
      companyId,
      metadata: { type: type.trim(), count: payload.length },
    });
    return result;
  }
}
