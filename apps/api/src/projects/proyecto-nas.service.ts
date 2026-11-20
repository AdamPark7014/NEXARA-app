import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { companyWhere } from '../common/tenant/tenant-scope.js';
import {
  CARPETA_COTIZACIONES,
  CARPETA_EVIDENCIA,
  FUENTE_NAS,
  carpetaDeActividad,
  nombreDeEvidencia,
  normalizarFuenteRef,
} from './proyecto-nas.js';

type ArchivoNas = { tipo: string; url: string; nombre: string; fecha: Date | null };

/**
 * Lo que el conector de la NAS necesita de un proyecto para escribir
 * «06 Plataforma/Cotizaciones Plataforma» y «06 Plataforma/Evidencia en campo Plataforma».
 * Solo lectura: no cambia nada en la plataforma ni mueve nada en la NAS.
 */
@Injectable()
export class ProyectoNasService {
  constructor(private readonly prisma: PrismaService) {}

  async porFuenteRef(ref: string, companyId: number | null, fuente = FUENTE_NAS) {
    const fuenteRef = normalizarFuenteRef(ref);
    const p = await this.prisma.operationalProject.findFirst({
      where: { fuente, fuenteRef, deletedAt: null, ...(companyId != null ? companyWhere(companyId) : {}) },
      select: { id: true },
    });
    if (!p) throw new NotFoundException(`No hay proyecto con ${fuente} «${fuenteRef}»`);
    return this.exportar(p.id, companyId);
  }

  async exportar(id: number, companyId: number | null) {
    const proyecto = await this.prisma.operationalProject.findFirst({
      where: { id, deletedAt: null, ...(companyId != null ? companyWhere(companyId) : {}) },
      select: {
        id: true,
        title: true,
        status: true,
        fuente: true,
        fuenteRef: true,
        startDate: true,
        endDate: true,
        cotizacionId: true,
        client: { select: { id: true, name: true } },
        responsable: { select: { id: true, nombre: true } },
      },
    });
    if (!proyecto) throw new NotFoundException('Proyecto no encontrado');

    const actividades = await this.prisma.activity.findMany({
      where: { projectId: id, deletedAt: null },
      orderBy: [{ fechaInicio: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        anNumber: true,
        titulo: true,
        estatus: true,
        fechaInicio: true,
        fechaAsignacion: true,
        cotizacionId: true,
        responsable: { select: { id: true, nombre: true } },
        evidencias: {
          where: { aprobada: true },
          orderBy: { subidoEn: 'asc' },
          select: { tipoEvidencia: true, archivoUrl: true, subidoEn: true },
        },
        activityEvidences: {
          where: { reviewStatus: 'APPROVED' },
          select: {
            entryPhotoUrl: true,
            entryPhotoUploadedAt: true,
            evidencePhotos: true,
            evidencePhotosUploadedAt: true,
            serviceSheetPdfUrl: true,
            serviceSheetUploadedAt: true,
            exitPhotoUrl: true,
            exitPhotoUploadedAt: true,
          },
        },
      },
    } as any);

    const salida = (actividades as any[]).map((a) => {
      const crudos: Omit<ArchivoNas, 'nombre'>[] = [];
      for (const e of a.evidencias ?? []) crudos.push({ tipo: e.tipoEvidencia || 'Evidencia', url: e.archivoUrl, fecha: e.subidoEn });
      for (const f of a.activityEvidences ?? []) {
        if (f.entryPhotoUrl) crudos.push({ tipo: 'Entrada', url: f.entryPhotoUrl, fecha: f.entryPhotoUploadedAt });
        for (const url of f.evidencePhotos ?? []) crudos.push({ tipo: 'Evidencia', url, fecha: f.evidencePhotosUploadedAt });
        if (f.serviceSheetPdfUrl) crudos.push({ tipo: 'Hoja de servicio', url: f.serviceSheetPdfUrl, fecha: f.serviceSheetUploadedAt });
        if (f.exitPhotoUrl) crudos.push({ tipo: 'Salida', url: f.exitPhotoUrl, fecha: f.exitPhotoUploadedAt });
      }
      const fecha = a.fechaInicio ?? a.fechaAsignacion;
      return {
        id: a.id,
        folio: a.anNumber,
        titulo: a.titulo,
        estatus: a.estatus,
        fecha,
        responsable: a.responsable ? { id: a.responsable.id, nombre: a.responsable.nombre } : null,
        carpeta: `${CARPETA_EVIDENCIA}/${carpetaDeActividad({ fecha, folio: a.anNumber, titulo: a.titulo })}`,
        archivos: crudos.map((c, i) => ({ ...c, nombre: nombreDeEvidencia(i, c.tipo, c.url) })),
      };
    });

    // Cotizaciones: la de origen del proyecto y las de sus actividades. Las R2, R3… son el
    // mismo registro (cambia `folioEnviado`), así que aquí sale cada cotización una vez.
    const idsCotizacion = [
      ...new Set([proyecto.cotizacionId, ...(actividades as any[]).map((a) => a.cotizacionId)].filter((v): v is number => v != null)),
    ];
    const cotizaciones = idsCotizacion.length
      ? await this.prisma.cotizacion.findMany({
          where: { id: { in: idsCotizacion } },
          select: { id: true, quoteNumber: true, folioEnviado: true, status: true, updatedAt: true },
        } as any)
      : [];

    return {
      proyecto: {
        id: proyecto.id,
        titulo: proyecto.title,
        estado: proyecto.status,
        fuente: proyecto.fuente,
        fuenteRef: proyecto.fuenteRef,
        inicio: proyecto.startDate,
        fin: proyecto.endDate,
        cliente: proyecto.client ? { id: proyecto.client.id, nombre: proyecto.client.name } : null,
        responsable: proyecto.responsable ? { id: proyecto.responsable.id, nombre: proyecto.responsable.nombre } : null,
      },
      carpetas: { cotizaciones: CARPETA_COTIZACIONES, evidencia: CARPETA_EVIDENCIA },
      cotizaciones: (cotizaciones as any[]).map((c) => ({
        id: c.id,
        folio: c.folioEnviado || c.quoteNumber,
        estado: c.status,
        actualizada: c.updatedAt,
        esOrigen: c.id === proyecto.cotizacionId,
        pdf: `/cotizaciones/${c.id}/pdf`,
        archivo: `${CARPETA_COTIZACIONES}/${(c.folioEnviado || c.quoteNumber || `Cotizacion ${c.id}`).replace(/[\\/:*?"<>|]/g, ' ')}.pdf`,
      })),
      actividades: salida,
    };
  }
}
