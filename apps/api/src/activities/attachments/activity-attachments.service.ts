import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PERMISSIONS } from '../../common/permissions.js';
import { getUploadSubdir } from '../../common/upload-paths.js';
import { esDeTodaLaEmpresa } from '../../me/equipo-alcance.js';
import { tipoDeDocumento, vistaPreviaHtml } from '../../common/files/vista-previa-documento.js';

export const ADJUNTOS_SUBDIR = 'actividades-adjuntos';
export const ADJUNTO_MAX_BYTES = 25 * 1024 * 1024;
export const ADJUNTOS_MAX_POR_ENVIO = 10;

/** Lo que se puede adjuntar: documentos de oficina, PDF, imágenes y texto. Nada ejecutable. */
export const EXTENSIONES_ADJUNTO = new Set([
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'heic',
  'heif',
  'xlsx',
  'xlsm',
  'xls',
  'csv',
  'docx',
  'doc',
  'pptx',
  'ppt',
  'txt',
]);

const MIME_POR_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  txt: 'text/plain',
};

export function extensionDe(nombre: string): string {
  return path.extname(nombre || '').toLowerCase().replace(/^\./, '');
}

export function mimeDeExtension(nombre: string): string {
  return MIME_POR_EXTENSION[extensionDe(nombre)] ?? 'application/octet-stream';
}

/**
 * multer entrega `originalname` decodificado como latin1: «Cotización.xlsx» llega como
 * «CotizaciÃ³n.xlsx». Si al releerlo como UTF-8 queda limpio, ese era el nombre real.
 */
export function nombreOriginal(original: string): string {
  const nombre = (original || '').trim();
  if (!/[\u0080-ÿ]/.test(nombre)) return nombre;
  const utf8 = Buffer.from(nombre, 'latin1').toString('utf8');
  return utf8.includes('�') ? nombre : utf8;
}

/** Nombre en disco: único y sin nada que permita salirse de la carpeta. */
export function nombreEnDisco(original: string): string {
  const ext = extensionDe(original).replace(/[^a-z0-9]/g, '').slice(0, 10);
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext ? `.${ext}` : ''}`;
}

export type Actor = {
  id: number;
  email?: string | null;
  roleKey?: string | null;
  isSuperAdmin?: boolean;
  permissions?: string[];
};

export type AdjuntoDto = {
  id: number;
  activityId: number;
  nombre: string;
  url: string;
  mimeType: string | null;
  sizeBytes: number | null;
  /** pdf · imagen · excel · csv · word · otro: qué visor usar. */
  tipo: ReturnType<typeof tipoDeDocumento>;
  /** El API arma vista previa HTML (Excel, CSV, Word). */
  vistaPrevia: boolean;
  createdAt: Date;
  subidoPor: { id: number; nombre: string } | null;
  /** Quien consulta lo puede quitar. */
  puedeQuitar: boolean;
};

type Fila = {
  id: number;
  activityId: number;
  userId: number | null;
  nombre: string;
  fileUrl: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: Date;
  user?: { id: number; nombre: string } | null;
};

/**
 * Archivos adjuntos a una actividad: la evidencia que no es foto. Sobre todo en las
 * comerciales (propuestas en Excel, minutas en Word, PDF del cliente), pero sirve para todas.
 *
 * Ver y bajar: quien ve la actividad. Adjuntar: su equipo (responsable, asignados, quien la
 * creó), dirección o quien gestiona actividades. Quitar: quien lo subió, el responsable o quien
 * la creó, dirección o quien gestiona actividades. Quitar no borra el archivo del disco.
 */
@Injectable()
export class ActivityAttachmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async actividad(activityId: number, companyId: number | null) {
    const act = await this.prisma.activity.findFirst({
      where: { id: activityId, deletedAt: null, ...(companyId != null ? { companyId } : {}) },
      select: {
        id: true,
        companyId: true,
        responsableId: true,
        creadoPorId: true,
        assignees: { where: { retiradoAt: null }, select: { userId: true } },
      },
    });
    if (!act) throw new NotFoundException('Actividad no encontrada');
    return act;
  }

  private esGestor(actor: Actor): boolean {
    return esDeTodaLaEmpresa(actor) || (actor.permissions ?? []).includes(PERMISSIONS.ACTIVITIES_MANAGE);
  }

  private esDelEquipo(actor: Actor, act: Awaited<ReturnType<ActivityAttachmentsService['actividad']>>): boolean {
    return (
      act.responsableId === actor.id ||
      act.creadoPorId === actor.id ||
      act.assignees.some((a) => a.userId === actor.id)
    );
  }

  private dto(f: Fila, actor: Actor, act: { responsableId: number; creadoPorId: number }): AdjuntoDto {
    const tipo = tipoDeDocumento(f.nombre, f.mimeType);
    return {
      id: f.id,
      activityId: f.activityId,
      nombre: f.nombre,
      url: f.fileUrl,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      tipo,
      vistaPrevia: tipo === 'excel' || tipo === 'csv' || tipo === 'word',
      createdAt: f.createdAt,
      subidoPor: f.user ? { id: f.user.id, nombre: f.user.nombre } : null,
      puedeQuitar:
        f.userId === actor.id ||
        act.responsableId === actor.id ||
        act.creadoPorId === actor.id ||
        this.esGestor(actor),
    };
  }

  async listar(activityId: number, actor: Actor, companyId: number | null): Promise<AdjuntoDto[]> {
    const act = await this.actividad(activityId, companyId);
    const filas = await this.prisma.activityAttachment.findMany({
      where: { activityId, deletedAt: null, companyId: act.companyId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, nombre: true } } },
    });
    return filas.map((f) => this.dto(f, actor, act));
  }

  async agregar(
    activityId: number,
    archivos: Array<{ nombre: string; filename: string; mimeType?: string | null; size?: number | null }>,
    actor: Actor,
    companyId: number | null,
  ): Promise<AdjuntoDto[]> {
    const act = await this.actividad(activityId, companyId);
    if (!this.esDelEquipo(actor, act) && !this.esGestor(actor)) {
      throw new ForbiddenException('Solo el equipo de la actividad o quien la gestiona puede adjuntar archivos');
    }
    if (!archivos.length) throw new BadRequestException('Adjunta al menos un archivo');
    const creados: Fila[] = [];
    for (const a of archivos) {
      const fila = await this.prisma.activityAttachment.create({
        data: {
          activityId,
          companyId: act.companyId,
          userId: actor.id || null,
          nombre: a.nombre.slice(0, 255),
          fileUrl: `/uploads/${ADJUNTOS_SUBDIR}/${a.filename}`,
          // El tipo se decide por la extensión: el que manda el navegador o el teléfono no es fiable.
          mimeType: mimeDeExtension(a.nombre),
          sizeBytes: typeof a.size === 'number' ? a.size : null,
        },
        include: { user: { select: { id: true, nombre: true } } },
      });
      creados.push(fila);
    }
    return creados.map((f) => this.dto(f, actor, act));
  }

  async quitar(activityId: number, adjuntoId: number, actor: Actor, companyId: number | null) {
    const act = await this.actividad(activityId, companyId);
    const fila = await this.prisma.activityAttachment.findFirst({
      where: { id: adjuntoId, activityId, deletedAt: null, companyId: act.companyId },
    });
    if (!fila) throw new NotFoundException('Archivo no encontrado');
    const puede =
      fila.userId === actor.id || act.responsableId === actor.id || act.creadoPorId === actor.id || this.esGestor(actor);
    if (!puede) throw new ForbiddenException('No puedes quitar este archivo');
    await this.prisma.activityAttachment.update({ where: { id: fila.id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  /** El archivo en disco, con su nombre y tipo, para bajarlo o verlo. */
  async archivo(activityId: number, adjuntoId: number, companyId: number | null) {
    const act = await this.actividad(activityId, companyId);
    const fila = await this.prisma.activityAttachment.findFirst({
      where: { id: adjuntoId, activityId, deletedAt: null, companyId: act.companyId },
    });
    if (!fila) throw new NotFoundException('Archivo no encontrado');
    const prefijo = `/uploads/${ADJUNTOS_SUBDIR}/`;
    if (!fila.fileUrl.startsWith(prefijo)) throw new NotFoundException('Archivo no encontrado');
    const enDisco = path.basename(fila.fileUrl.slice(prefijo.length));
    const ruta = path.join(getUploadSubdir(__dirname, ADJUNTOS_SUBDIR), enDisco);
    try {
      const buffer = await fs.readFile(ruta);
      return { buffer, nombre: fila.nombre, mimeType: fila.mimeType ?? mimeDeExtension(fila.nombre) };
    } catch {
      throw new NotFoundException('El archivo ya no está en el servidor');
    }
  }

  /** Vista previa HTML (Excel, CSV, Word); null si ese tipo no la tiene. */
  async vistaPrevia(activityId: number, adjuntoId: number, companyId: number | null): Promise<string | null> {
    const { buffer, nombre, mimeType } = await this.archivo(activityId, adjuntoId, companyId);
    try {
      return await vistaPreviaHtml(buffer, nombre, mimeType);
    } catch {
      throw new BadRequestException('No se pudo leer el archivo para la vista previa. Descárgalo para abrirlo.');
    }
  }
}
