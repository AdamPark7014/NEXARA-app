import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Res,
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

// Resuelve la ruta absoluta a /uploads/clients en la raíz del proyecto y asegura su existencia
const ensureUploadsDir = () => {
  const baseUploads = path.join(__dirname, '../../..', 'uploads');
  const dir = path.join(baseUploads, 'clients');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

@Controller('service-clients')
export class ServiceClientsController {
  constructor(private readonly serviceClientsService: ServiceClientsService) {}

  private getFileInterceptor() {
    const uploadDir = this.getUploadDir();
    return FileInterceptor('logo', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
          const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname}`;
          cb(null, uniqueName);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Solo se aceptan imágenes'), false);
        }
        cb(null, true);
      },
    });
  }

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
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
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
  async create(@UploadedFile() file: any, @Body() body: CreateServiceClientDto) {
    if (!body?.name) throw new BadRequestException('Nombre requerido');
    const isActive = this.normalizeBoolean(body.isActive);
    if (isActive !== undefined) body.isActive = isActive;
    const logoUrl = file ? `/uploads/clients/${file.filename}` : undefined;
    return this.serviceClientsService.create(body, logoUrl);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  @Get()
  findAll() {
    return this.serviceClientsService.findAll();
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.serviceClientsService.findOne(id);
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
  ) {
    const isActive = this.normalizeBoolean(body.isActive);
    if (isActive !== undefined) body.isActive = isActive;
    const logoUrl = file ? `/uploads/clients/${file.filename}` : undefined;
    return this.serviceClientsService.update(id, body, logoUrl);
  }
}
