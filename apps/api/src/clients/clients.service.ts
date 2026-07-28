import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  assertCompanyAccess,
  companyWhere,
  resolvePublicCompanyId,
} from '../common/tenant/tenant-scope.js';
import { withTenantBypassAsync } from '../common/tenant/tenant-context.js';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  private get db() {
    return this.prisma;
  }

  async create(createClientDto: CreateClientDto, imageFile?: MulterFile) {
    let imageUrl: string | null = null;

    if (imageFile) {
      imageUrl = await this.saveImage(imageFile);
    }

    return await this.db['client'].create({
      data: {
        name: createClientDto.name,
        description: createClientDto.description || null,
        imageUrl: imageUrl || null,
      },
    });
  }

  async findAll(query?: PaginationQueryDto) {
    const companyId = await withTenantBypassAsync(() => resolvePublicCompanyId(this.prisma));
    const where: any = {
      ...companyWhere(companyId),
      ...(query?.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {}),
    };
    if (query?.limit) {
      const [data, total] = await withTenantBypassAsync(() =>
        Promise.all([
          this.db.client.findMany({ where, orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.take }),
          this.db.client.count({ where }),
        ]),
      );
      return buildPaginatedResponse(data, total, query);
    }
    return withTenantBypassAsync(() =>
      this.db.client.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async findOne(id: number) {
    const companyId = await withTenantBypassAsync(() => resolvePublicCompanyId(this.prisma));
    const client = await withTenantBypassAsync(() =>
      this.db.client.findFirst({
        where: { id, ...companyWhere(companyId) },
      }),
    );
    assertCompanyAccess(client, companyId, 'Client');
    return client;
  }

  async update(
    id: number,
    updateClientDto: UpdateClientDto,
    imageFile?: MulterFile,
  ) {
    const existingClient = await this.db['client'].findUnique({
      where: { id },
    });

    if (!existingClient) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    const { removeImage, ...rest } = updateClientDto as UpdateClientDto & {
      removeImage?: string;
    };
    const shouldRemoveImage = removeImage === 'true';

    if ((shouldRemoveImage || imageFile) && existingClient.imageUrl) {
      await this.deleteImage(existingClient.imageUrl);
    }

    let imageUrl: string | null = null;
    if (imageFile) {
      imageUrl = await this.saveImage(imageFile);
    }

    const updateData: Record<string, any> = {
      ...rest,
    };

    if (shouldRemoveImage) {
      updateData['imageUrl'] = null;
    }

    if (imageUrl) {
      updateData['imageUrl'] = imageUrl;
    }

    return await this.db['client'].update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: number) {
    const client = await this.db['client'].findUnique({
      where: { id },
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    if (client.imageUrl) {
      await this.deleteImage(client.imageUrl);
    }

    return await this.db['client'].delete({
      where: { id },
    });
  }

  private async saveImage(file: MulterFile): Promise<string> {
    try {
      // Usar ruta absoluta desde el directorio actual de ejecución
      const uploadDir = path.resolve(
        process.cwd(),
        process.env['UPLOAD_DIR'] || './uploads/clients'
      );
      await fs.mkdir(uploadDir, { recursive: true });

      const filename = `${Date.now()}-${file.originalname}`;
      const filepath = path.join(uploadDir, filename);

      await fs.writeFile(filepath, file.buffer);

      // Retornar la URL accesible en lugar de solo el nombre del archivo
      const imageUrl = `/clients/image/${filename}`;
      return imageUrl;
    } catch (_error) {
      throw new InternalServerErrorException('Error saving image');
    }
  }

  private async deleteImage(imageUrl: string): Promise<void> {
    try {
      // Extraer el filename de la URL: /clients/image/123456-filename.jpg
      const filename = imageUrl.split('/').pop();
      if (!filename) return;

      const uploadDir = path.resolve(
        process.cwd(),
        process.env['UPLOAD_DIR'] || './uploads/clients'
      );
      const filepath = path.join(uploadDir, filename);
      await fs.unlink(filepath);
    } catch (_error) {
      // Silently fail if image doesn't exist
    }
  }
}
