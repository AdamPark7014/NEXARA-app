import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ParseIntPipe,
  Res,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import { ClientsService } from './clients.service.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CLIENTS_MANAGE] })
  @UseInterceptors(FileInterceptor('image'))
  async create(
    @Body() createClientDto: CreateClientDto,
    @UploadedFile() file?: MulterFile,
  ) {
    if (file && !this.isValidImageFile(file)) {
      throw new BadRequestException('Invalid image file format');
    }
    return this.clientsService.create(createClientDto, file);
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
  async getImage(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    try {
      // Usar la ruta absoluta del directorio de carga
      const uploadDir = path.resolve(
        process.cwd(),
        process.env['UPLOAD_DIR'] || './uploads/clients'
      );
      const filepath = path.join(uploadDir, filename);
      
      // Validar que el archivo existe en el directorio permitido (security check)
      const realPath = await fs.realpath(filepath);
      const realUploadDir = await fs.realpath(uploadDir);
      
      if (!realPath.startsWith(realUploadDir)) {
        throw new NotFoundException('File not found');
      }

      // Verificar que el archivo existe
      await fs.access(filepath);
      
      // Servir el archivo con headers apropiados
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      
      const stream = createReadStream(filepath);
      stream.pipe(res);
    } catch (_error) {
      throw new NotFoundException('Image not found');
    }
  }

  @Put(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CLIENTS_MANAGE] })
  @UseInterceptors(FileInterceptor('image'))
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateClientDto: UpdateClientDto,
    @UploadedFile() file?: MulterFile,
  ) {
    if (file && !this.isValidImageFile(file)) {
      throw new BadRequestException('Invalid image file format');
    }
    return this.clientsService.update(id, updateClientDto, file);
  }

  @Delete(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CLIENTS_MANAGE] })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.clientsService.remove(id);
  }

  private isValidImageFile(file: MulterFile): boolean {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const maxSize = parseInt(process.env['MAX_FILE_SIZE'] || '5242880');

    return allowedMimes.includes(file.mimetype) && file.size <= maxSize;
  }
}
