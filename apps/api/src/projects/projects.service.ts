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

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 36;
    const cardWidth = pageWidth - margin * 2;

    doc.save();
    doc
      .rect(0, 0, pageWidth, 120)
      .fill('#0d4d82');
    doc
      .rect(0, 0, pageWidth, 64)
      .fill('#2f8ec8');
    doc.restore();

    doc
      .fillColor('#ffffff')
      .fontSize(26)
      .text('CV Empresarial de Proyectos', margin, 40, { align: 'left' })
      .fontSize(11)
      .text(`Generado: ${new Date().toLocaleString('es-MX')}`)
      .text(`Total de proyectos: ${projects.length}`);

    doc.y = 138;

    if (!projects.length) {
      doc
        .fontSize(12)
        .fillColor('#22303e')
        .text('No hay proyectos registrados para incluir en este documento.');
      doc.end();
      return pdfBufferPromise;
    }

    for (let index = 0; index < projects.length; index += 1) {
      const project = projects[index];
      const cardHeight = 310;
      if (doc.y + cardHeight > pageHeight - margin) {
        doc.addPage();
        doc.y = margin;
      }

      const x = margin;
      const y = doc.y;
      const visibility = project.showInCatalog ? 'Visible en catalogo' : 'No visible en catalogo';

      doc.save();
      doc.roundedRect(x, y, cardWidth, cardHeight, 12).fill('#f7fbff');
      doc.roundedRect(x, y, cardWidth, 50, 12).fill('#1b5f9e');
      doc.restore();

      doc
        .fillColor('#ffffff')
        .fontSize(15)
        .text(`${index + 1}. ${project.title}`, x + 14, y + 16, { width: cardWidth - 28 });

      doc
        .fillColor('#2b4b67')
        .fontSize(10)
        .text(`Sector: ${project.sector}`, x + 14, y + 60)
        .text(`Slug: ${project.slug}`)
        .text(`Estado catalogo: ${visibility}`)
        .text(`Creado: ${project.createdAt.toLocaleDateString('es-MX')}`);

      const mediaY = y + 126;
      const mainImageX = x + 14;
      const mainImageWidth = 300;
      const mainImageHeight = 150;
      const galleryX = mainImageX + mainImageWidth + 10;
      const thumbGap = 6;
      const thumbSize = 72;

      await this.drawProjectImage(
        doc,
        project.mainImage || undefined,
        mainImageX,
        mediaY,
        mainImageWidth,
        mainImageHeight,
      );

      const galleryList = (project.gallery || []).slice(0, 4);
      for (let g = 0; g < 4; g += 1) {
        const gx = galleryX + (g % 2) * (thumbSize + thumbGap);
        const gy = mediaY + Math.floor(g / 2) * (thumbSize + thumbGap);
        await this.drawProjectImage(doc, galleryList[g], gx, gy, thumbSize, thumbSize);
      }

      doc
        .fillColor('#243749')
        .fontSize(10)
        .text(project.summary || 'Sin resumen', x + 14, y + 282, {
          width: cardWidth - 28,
          lineGap: 2,
        });

      const metaY = y + 236;
      doc
        .fillColor('#2f4f67')
        .fontSize(10)
        .text(`Impacto: ${project.impact || 'No especificado'}`, galleryX, metaY, {
          width: cardWidth - (galleryX - x) - 14,
          lineGap: 2,
        })
        .text(`Servicios: ${(project.services || []).join(', ') || 'No especificados'}`, {
          width: cardWidth - (galleryX - x) - 14,
          lineGap: 2,
        });

      doc.y = y + cardHeight + 14;
    }

    doc.end();
    return pdfBufferPromise;
  }

  private async drawProjectImage(
    doc: any,
    imageUrl: string | undefined,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    doc
      .save()
      .roundedRect(x, y, width, height, 8)
      .fill('#e9f2f8')
      .stroke('#c7d8e6')
      .restore();

    const imagePath = await this.resolveProjectImagePath(imageUrl);
    if (imagePath) {
      try {
        doc.image(imagePath, x, y, { fit: [width, height], align: 'center', valign: 'center' });
        return;
      } catch {
        // fallback to placeholder
      }
    }

    doc
      .fillColor('#6a8298')
      .fontSize(9)
      .text('Imagen de proyecto', x + 10, y + height / 2 - 5, {
        width: width - 20,
        align: 'center',
      });
  }

  private async resolveProjectImagePath(imageUrl?: string) {
    if (!imageUrl) return null;

    if (imageUrl.startsWith('/projects/image/')) {
      const filename = imageUrl.split('/').pop();
      if (!filename) return null;
      const uploadPath = path.resolve(process.cwd(), './uploads/projects', filename);
      try {
        await fs.access(uploadPath);
        return uploadPath;
      } catch {
        return null;
      }
    }

    if (imageUrl.startsWith('/')) {
      const publicPath = path.resolve(process.cwd(), './apps/web/public', imageUrl.slice(1));
      try {
        await fs.access(publicPath);
        return publicPath;
      } catch {
        return null;
      }
    }

    return null;
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
