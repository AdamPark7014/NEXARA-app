import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { Response } from 'express';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CreateServiceClientDto } from './dto/create-service-client.dto.js';
import { UpdateServiceClientDto } from './dto/update-service-client.dto.js';
import { ServiceClientsService } from './service-clients.service.js';
import { Request } from 'express';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';

// Resuelve la ruta absoluta a /uploads/clients en la raíz del proyecto y asegura su existencia
const ensureUploadsDir = () => {
  const segments = __dirname.split(path.sep);
  const appsIndex = segments.lastIndexOf('apps');
  const projectRoot = appsIndex > 0
    ? (segments.slice(0, appsIndex).join(path.sep) || path.sep)
    : path.resolve(__dirname, '../../..');

  const baseUploads = path.join(projectRoot, 'uploads');
  const dir = path.join(baseUploads, 'clients');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.error(`[uploads] created dir ${dir}`);
  }
  return dir;
};

@Controller('service-clients')
export class ServiceClientsController {
  constructor(private readonly serviceClientsService: ServiceClientsService) {}

  private normalizeBoolean(value: unknown) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
    }
    return undefined;
  }

  @UseGuards(RbacGuard)
  @RBAC({
    anyPermissions: [
      PERMISSIONS.CONSOLE_ADMIN,
      PERMISSIONS.MAINTENANCE_MANAGE,
      PERMISSIONS.ASSETS_MANAGE,
    ],
  })
  @Post()
  @UseInterceptors(FileInterceptor('logo', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        cb(null, ensureUploadsDir());
      },
      filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname}`;
        cb(null, uniqueName);
      },
    }),
  }))
  async create(@UploadedFile() file: any, @Body() body: CreateServiceClientDto, @Req() req: Request) {
    console.error(`[uploads] create request content-type: ${req.headers['content-type'] || ''}`);
    if (!body?.name) throw new BadRequestException('Nombre requerido');
    const isActive = this.normalizeBoolean(body.isActive);
    if (isActive !== undefined) body.isActive = isActive;
    if (file) {
      console.error(`[uploads] create file saved -> ${file.filename} (${file.path || ''})`);
    } else {
      console.error('[uploads] create without file');
    }
    const logoUrl = file ? `/uploads/clients/${file.filename}` : undefined;
    return this.serviceClientsService.create(body, logoUrl);
  }

  @UseGuards(RbacGuard)
  @RBAC({
    anyPermissions: [
      PERMISSIONS.CONSOLE_ADMIN,
      PERMISSIONS.SUPPORT_VIEW,
      PERMISSIONS.MAINTENANCE_VIEW,
      PERMISSIONS.ASSETS_VIEW,
    ],
  })
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.serviceClientsService.findAll(query);
  }

  @UseGuards(RbacGuard)
  @RBAC({
    anyPermissions: [
      PERMISSIONS.CONSOLE_ADMIN,
      PERMISSIONS.SUPPORT_VIEW,
      PERMISSIONS.MAINTENANCE_VIEW,
      PERMISSIONS.ASSETS_VIEW,
    ],
  })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.serviceClientsService.findOne(id);
  }

  /** Vista 360° del cliente: agregaciones cross-módulo + timeline. */
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  @Get(':id/snapshot')
  snapshot(@Param('id', ParseIntPipe) id: number) {
    return this.serviceClientsService.clientSnapshot(id);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  @Get(':id/report')
  async report(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const { pdf } = await this.serviceClientsService.generateReport(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=reporte-cliente-${id}.pdf`);
    res.send(pdf);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  @Get(':id/branches')
  listBranches(@Param('id', ParseIntPipe) id: number) {
    return this.serviceClientsService.listBranches(id);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  @Post(':id/branches')
  createBranch(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name: string; branchNumber?: string; address?: string; city?: string; state?: string; country?: string },
  ) {
    if (!body?.name) throw new BadRequestException('Nombre de sucursal requerido');
    return this.serviceClientsService.createBranch(id, body);
  }

  @UseGuards(RbacGuard)
  @RBAC({
    anyPermissions: [
      PERMISSIONS.CONSOLE_ADMIN,
      PERMISSIONS.SUPPORT_VIEW,
      PERMISSIONS.ACTIVITIES_MANAGE,
    ],
  })
  @Post(':id/ticket-requests')
  createTicketRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { description?: string; branchId?: number; urgency?: string; requestType?: string },
  ) {
    if (!body?.description?.trim()) throw new BadRequestException('Descripción requerida');
    return this.serviceClientsService.createTicketRequest(id, {
      description: body.description,
      branchId: body.branchId ? Number(body.branchId) : undefined,
      urgency: body.urgency,
      requestType: body.requestType,
    });
  }

  @UseGuards(RbacGuard)
  @RBAC({
    anyPermissions: [
      PERMISSIONS.CONSOLE_ADMIN,
      PERMISSIONS.MAINTENANCE_MANAGE,
      PERMISSIONS.ASSETS_MANAGE,
    ],
  })
  @Put(':id')
  @UseInterceptors(FileInterceptor('logo', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        cb(null, ensureUploadsDir());
      },
      filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname}`;
        cb(null, uniqueName);
      },
    }),
  }))
  update(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: any,
    @Body() body: UpdateServiceClientDto,
    @Req() req: Request,
  ) {
    console.error(`[uploads] update request content-type: ${req.headers['content-type'] || ''}`);
    const isActive = this.normalizeBoolean(body.isActive);
    if (isActive !== undefined) body.isActive = isActive;
    if (file) {
      console.error(`[uploads] update file saved -> ${file.filename} (${file.path || ''})`);
    } else {
      console.error('[uploads] update without file');
    }
    const logoUrl = file ? `/uploads/clients/${file.filename}` : undefined;
    return this.serviceClientsService.update(id, body, logoUrl);
  }
}
