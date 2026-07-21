import {
  Controller,
  Get,
  Post,
  Param,
  Delete,
  Put,
  Query,
  BadRequestException,
  ParseIntPipe,
  Res,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import { ClientsService } from './clients.service.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

/**
 * @deprecated Legacy landing/logos (`Client` / `/api/clients`).
 * Usar SalesClient (`/ventas/clientes`) + ServiceClient (`/service-clients`).
 * Escrituras bloqueadas; lecturas/imágenes se mantienen por compatibilidad.
 */
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CLIENTS_MANAGE] })
  create() {
    throw new BadRequestException(
      'Endpoint deprecado. Crea clientes en CRM (/ventas/clientes) o en OPS (/service-clients).',
    );
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.clientsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clientsService.findOne(id);
  }

  @Get('image/:filename')
  async getImage(@Param('filename') filename: string, @Res() res: Response) {
    try {
      const uploadDir = path.resolve(
        process.cwd(),
        process.env['UPLOAD_DIR'] || './uploads/clients',
      );
      const filepath = path.join(uploadDir, filename);
      const realPath = await fs.realpath(filepath);
      const realUploadDir = await fs.realpath(uploadDir);
      if (!realPath.startsWith(realUploadDir)) {
        throw new NotFoundException('File not found');
      }
      await fs.access(filepath);
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      createReadStream(filepath).pipe(res);
    } catch {
      throw new NotFoundException('File not found');
    }
  }

  @Put(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CLIENTS_MANAGE] })
  update() {
    throw new BadRequestException(
      'Endpoint deprecado. Actualiza en CRM (/ventas/clientes) o OPS (/service-clients).',
    );
  }

  @Delete(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CLIENTS_MANAGE] })
  remove() {
    throw new BadRequestException(
      'Endpoint deprecado. Elimina desde CRM (/ventas/clientes) o OPS (/service-clients).',
    );
  }
}
