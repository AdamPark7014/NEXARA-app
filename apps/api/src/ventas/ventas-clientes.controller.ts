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

@Controller('ventas/clientes')
export class VentasClientesController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  create(@Body() dto: CreateSalesClientDto, @CurrentUser() user: any) {
    return this.ventasService.createClient(dto, user);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  findAll(@CurrentUser() user: any) {
    return this.ventasService.listClients(user);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.getClient(id, user);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSalesClientDto, @CurrentUser() user: any) {
    return this.ventasService.updateClient(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.deleteClient(id, user);
  }

  @Post(':id/documentos')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
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
    return this.ventasService.addClientDocuments(id, type.trim(), payload, user);
  }
}
