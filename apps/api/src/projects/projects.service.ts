import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface ProjectFiles {
  mainImage?: MulterFile;
  gallery?: MulterFile[];
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  private get db() {
    return this.prisma;
  }

  async create(createProjectDto: CreateProjectDto, files: ProjectFiles) {
    const payload = this.normalizePayload(createProjectDto);

    if (!payload.title || !payload.sector || !payload.summary || !payload.impact) {
      throw new BadRequestException('Campos requeridos faltantes');
    }

    if (!payload.services.length || !payload.tags.length || !payload.highlights.length) {
      throw new BadRequestException('Listas requeridas incompletas');
    }

    const mainImage = files.mainImage;
    const gallery = files.gallery || [];

    if (!mainImage) {
      throw new BadRequestException('La imagen principal es requerida');
    }

    if (gallery.length !== 8) {
      throw new BadRequestException('La galeria debe tener exactamente 8 imagenes');
    }

    const slug = this.ensureSlug(payload.slug || payload.title);

    const existingSlug = await this.db.project.findUnique({ where: { slug } });
    if (existingSlug) {
      throw new BadRequestException('El slug ya existe');
    }

    const mainImageUrl = await this.saveImage(mainImage);
    const galleryUrls = await this.saveImages(gallery);

    const project = await this.db.project.create({
      data: {
        slug,
        title: payload.title,
        sector: payload.sector,
        summary: payload.summary,
        impact: payload.impact,
        services: payload.services,
        tags: payload.tags,
        highlights: payload.highlights,
        mainImage: mainImageUrl,
        gallery: galleryUrls,
        showInCatalog: payload.showInCatalog ?? true,
      },
    });

    this.realtimeGateway.emit('projects:changed', {
      type: 'created',
      project,
    });

    return project;
  }

  async findAll() {
    return this.db.project.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const project = await this.db.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundException(`Proyecto con ID ${id} no encontrado`);
    }
    return project;
  }

  async update(
    id: number,
    updateProjectDto: UpdateProjectDto & { galleryKeep?: string[] },
    files: ProjectFiles,
  ) {
    const existing = await this.db.project.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Proyecto con ID ${id} no encontrado`);
    }

    const payload = this.normalizePayload(updateProjectDto);
    const updateData: Record<string, any> = {};
    const galleryKeep = updateProjectDto.galleryKeep;

    if (payload.title !== undefined) updateData['title'] = payload.title;
    if (payload.sector !== undefined) updateData['sector'] = payload.sector;
    if (payload.summary !== undefined) updateData['summary'] = payload.summary;
    if (payload.impact !== undefined) updateData['impact'] = payload.impact;
    if (payload.services.length) updateData['services'] = payload.services;
    if (payload.tags.length) updateData['tags'] = payload.tags;
    if (payload.highlights.length) updateData['highlights'] = payload.highlights;
    if (payload.showInCatalog !== undefined) updateData['showInCatalog'] = payload.showInCatalog;

    if (payload.slug) {
      const slug = this.ensureSlug(payload.slug);
      if (slug !== existing.slug) {
        const slugExists = await this.db.project.findUnique({ where: { slug } });
        if (slugExists) {
          throw new BadRequestException('El slug ya existe');
        }
        updateData['slug'] = slug;
      }
    }

    if (files.mainImage) {
      if (existing.mainImage) {
        await this.deleteImage(existing.mainImage);
      }
      updateData['mainImage'] = await this.saveImage(files.mainImage);
    }

    if (galleryKeep !== undefined || (files.gallery && files.gallery.length)) {
      const keep = galleryKeep ?? existing.gallery;
      const newFiles = files.gallery || [];
      const totalCount = keep.length + newFiles.length;

      if (newFiles.length && totalCount !== 8) {
        throw new BadRequestException('La galeria debe tener exactamente 8 imagenes');
      }

      if (!newFiles.length && keep.length !== 8) {
        throw new BadRequestException('La galeria debe tener exactamente 8 imagenes');
      }

      const removed = existing.gallery.filter((item) => !keep.includes(item));
      await this.deleteGallery(removed);

      const newUrls = newFiles.length ? await this.saveImages(newFiles) : [];
      updateData['gallery'] = [...keep, ...newUrls];
    }

    const project = await this.db.project.update({
      where: { id },
      data: updateData,
    });

    this.realtimeGateway.emit('projects:changed', {
      type: 'updated',
      project,
    });

    return project;
  }

  async remove(id: number) {
    const project = await this.db.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundException(`Proyecto con ID ${id} no encontrado`);
    }

    if (project.mainImage) {
      await this.deleteImage(project.mainImage);
    }
    await this.deleteGallery(project.gallery);

    const removed = await this.db.project.delete({ where: { id } });

    this.realtimeGateway.emit('projects:changed', {
      type: 'deleted',
      project: removed,
    });

    return removed;
  }

  async buildCatalogPdf(): Promise<Buffer> {
    const projects = await this.db.project.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title: 'CV Empresarial de Proyectos',
        Author: 'Nexara',
      },
    });

    const chunks: Uint8Array[] = [];
    const pdfBufferPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (error) => reject(error));
    });

    doc
      .fontSize(22)
      .fillColor('#0c3f72')
      .text('CV Empresarial de Proyectos', { align: 'left' });
    doc
      .moveDown(0.3)
      .fontSize(10)
      .fillColor('#3d4e60')
      .text(`Generado: ${new Date().toLocaleString('es-MX')}`)
      .text(`Total de proyectos: ${projects.length}`);

    doc.moveDown(0.8);
    doc.strokeColor('#d5deea').lineWidth(1).moveTo(48, doc.y).lineTo(547, doc.y).stroke();
    doc.moveDown(0.8);

    if (!projects.length) {
      doc
        .fontSize(12)
        .fillColor('#22303e')
        .text('No hay proyectos registrados para incluir en este documento.');
      doc.end();
      return pdfBufferPromise;
    }

    projects.forEach((project, index) => {
      if (doc.y > 700) {
        doc.addPage();
      }

      const visibility = project.showInCatalog ? 'Visible en catalogo' : 'No visible en catalogo';

      doc
        .fontSize(14)
        .fillColor('#0d2d52')
        .text(`${index + 1}. ${project.title}`)
        .moveDown(0.15)
        .fontSize(10)
        .fillColor('#324b63')
        .text(`Sector: ${project.sector}`)
        .text(`Slug: ${project.slug}`)
        .text(`Estado catalogo: ${visibility}`)
        .text(`Creado: ${project.createdAt.toLocaleDateString('es-MX')}`)
        .moveDown(0.2)
        .fontSize(10)
        .fillColor('#1d2b39')
        .text(project.summary || 'Sin resumen')
        .moveDown(0.2)
        .fillColor('#3a4e63')
        .text(`Impacto: ${project.impact || 'No especificado'}`)
        .text(`Servicios: ${(project.services || []).join(', ') || 'No especificados'}`)
        .text(`Tags: ${(project.tags || []).join(', ') || 'No especificados'}`)
        .moveDown(0.6);

      doc.strokeColor('#e1e7ef').lineWidth(1).moveTo(48, doc.y).lineTo(547, doc.y).stroke();
      doc.moveDown(0.7);
    });

    doc.end();
    return pdfBufferPromise;
  }

  private normalizePayload(dto: Partial<CreateProjectDto>) {
    return {
      slug: dto.slug?.trim(),
      title: dto.title?.trim(),
      sector: dto.sector?.trim(),
      summary: dto.summary?.trim(),
      impact: dto.impact?.trim(),
      services: this.sanitizeList(dto.services),
      tags: this.sanitizeList(dto.tags),
      highlights: this.sanitizeList(dto.highlights),
      showInCatalog: dto.showInCatalog,
    };
  }

  private sanitizeList(values?: string[]) {
    if (!values) return [];
    return values.map((item) => item.trim()).filter((item) => item.length > 0);
  }

  private ensureSlug(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  private async saveImages(files: MulterFile[]): Promise<string[]> {
    const saved: string[] = [];
    for (const file of files) {
      saved.push(await this.saveImage(file));
    }
    return saved;
  }

  private async saveImage(file: MulterFile): Promise<string> {
    try {
      const uploadDir = path.resolve(process.cwd(), './uploads/projects');
      await fs.mkdir(uploadDir, { recursive: true });

      const filename = `${Date.now()}-${file.originalname}`;
      const filepath = path.join(uploadDir, filename);

      await fs.writeFile(filepath, file.buffer);

      return `/projects/image/${filename}`;
    } catch (_error) {
      throw new InternalServerErrorException('Error al guardar la imagen');
    }
  }

  private async deleteGallery(gallery: string[]) {
    for (const imageUrl of gallery) {
      await this.deleteImage(imageUrl);
    }
  }

  private async deleteImage(imageUrl: string): Promise<void> {
    try {
      const filename = imageUrl.split('/').pop();
      if (!filename) return;

      const uploadDir = path.resolve(process.cwd(), './uploads/projects');
      const filepath = path.join(uploadDir, filename);
      await fs.unlink(filepath);
    } catch (_error) {
      // Ignore missing files
    }
  }
}
