import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type ActivityEvidenceStatus = 'ENTRY_PHOTO' | 'EVIDENCE_PHOTOS' | 'SERVICE_SHEET_PDF' | 'SERVICE_SHEET_DATA' | 'EXIT_PHOTO' | 'COMPLETED';

@Injectable()
export class ActivityEvidenceService {
  constructor(private prisma: PrismaService) {}

  /**
   * Obtener o crear el registro de evidencias de una actividad
   */
  async getOrCreateActivityEvidence(activityId: number) {
    let evidence = await this.prisma.activityEvidence.findUnique({
      where: { activityId },
    });

    if (!evidence) {
      // Verificar que la actividad existe
      const activity = await this.prisma.activity.findUnique({
        where: { id: activityId },
      });

      if (!activity) {
        throw new NotFoundException('Actividad no encontrada');
      }

      evidence = await this.prisma.activityEvidence.create({
        data: {
          activityId,
          status: 'ENTRY_PHOTO',
        },
      });
    }

    return evidence;
  }

  /**
   * Guardar foto de entrada
   */
  async saveEntryPhoto(
    activityId: number,
    photoUrl: string,
    latitude: number,
    longitude: number,
  ) {
    const evidence = await this.getOrCreateActivityEvidence(activityId);

    if (evidence.status !== 'ENTRY_PHOTO') {
      throw new BadRequestException('Ya se ha guardado la foto de entrada');
    }

    return this.prisma.activityEvidence.update({
      where: { activityId },
      data: {
        entryPhotoUrl: photoUrl,
        entryLatitude: latitude,
        entryLongitude: longitude,
        entryPhotoUploadedAt: new Date(),
        status: 'EVIDENCE_PHOTOS',
      },
    });
  }

  /**
   * Guardar fotos de evidencia (4-8 fotos)
   */
  async saveEvidencePhotos(activityId: number, photoUrls: string[]) {
    const evidence = await this.getOrCreateActivityEvidence(activityId);

    if (evidence.status !== 'EVIDENCE_PHOTOS') {
      throw new BadRequestException('No estás en el paso correcto para guardar evidencias');
    }

    if (photoUrls.length < 4) {
      throw new BadRequestException('Mínimo 4 fotos de evidencia son requeridas');
    }

    if (photoUrls.length > 8) {
      throw new BadRequestException('Máximo 8 fotos de evidencia permitidas');
    }

    return this.prisma.activityEvidence.update({
      where: { activityId },
      data: {
        evidencePhotos: photoUrls,
        evidencePhotosUploadedAt: new Date(),
        status: 'SERVICE_SHEET_PDF',
      },
    });
  }

  /**
   * Guardar hoja de servicio PDF
   */
  async saveServiceSheetPdf(activityId: number, pdfUrl: string) {
    const evidence = await this.getOrCreateActivityEvidence(activityId);

    if (evidence.status !== 'SERVICE_SHEET_PDF') {
      throw new BadRequestException('No estás en el paso correcto para guardar la hoja de servicio');
    }

    return this.prisma.activityEvidence.update({
      where: { activityId },
      data: {
        serviceSheetPdfUrl: pdfUrl,
        serviceSheetUploadedAt: new Date(),
        status: 'SERVICE_SHEET_DATA',
      },
    });
  }

  /**
   * Completar plantilla de hoja de servicio interna
   */
  async completeServiceSheetForm(activityId: number, data: any) {
    const evidence = await this.getOrCreateActivityEvidence(activityId);

    if (evidence.status !== 'SERVICE_SHEET_DATA') {
      throw new BadRequestException('No estás en el paso correcto para completar la plantilla');
    }

    return this.prisma.activityEvidence.update({
      where: { activityId },
      data: {
        serviceSheetData: data,
        serviceSheetCompletedAt: new Date(),
        status: 'EXIT_PHOTO',
      },
    });
  }

  /**
   * Guardar foto de salida
   */
  async saveExitPhoto(
    activityId: number,
    photoUrl: string,
    latitude: number,
    longitude: number,
  ) {
    const evidence = await this.getOrCreateActivityEvidence(activityId);

    if (evidence.status !== 'EXIT_PHOTO') {
      throw new BadRequestException('No estás en el paso correcto para guardar la foto de salida');
    }

    const updated = await this.prisma.activityEvidence.update({
      where: { activityId },
      data: {
        exitPhotoUrl: photoUrl,
        exitLatitude: latitude,
        exitLongitude: longitude,
        exitPhotoUploadedAt: new Date(),
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // Actualizar el estatus de la actividad a completada
    await this.prisma.activity.update({
      where: { id: activityId },
      data: {
        estatus: 'Completado',
        fechaFinalizacion: new Date(),
      },
    });

    return updated;
  }

  /**
   * Obtener evidencias de una actividad
   */
  async getActivityEvidence(activityId: number) {
    const evidence = await this.prisma.activityEvidence.findUnique({
      where: { activityId },
      include: {
        activity: true,
      },
    });

    if (!evidence) {
      throw new NotFoundException('Evidencias no encontradas');
    }

    return evidence;
  }

  /**
   * Actualizar foto de evidencia (remover y reemplazar)
   */
  async updateEvidencePhoto(activityId: number, index: number, newPhotoUrl: string) {
    const evidence = await this.getOrCreateActivityEvidence(activityId);

    if (!evidence.evidencePhotos || evidence.evidencePhotos.length === 0) {
      throw new BadRequestException('No hay fotos de evidencia para actualizar');
    }

    if (index < 0 || index >= evidence.evidencePhotos.length) {
      throw new BadRequestException('Índice de foto inválido');
    }

    const updatedPhotos = [...evidence.evidencePhotos];
    updatedPhotos[index] = newPhotoUrl;

    return this.prisma.activityEvidence.update({
      where: { activityId },
      data: {
        evidencePhotos: updatedPhotos,
      },
    });
  }

  /**
   * Remover foto de evidencia
   */
  async removeEvidencePhoto(activityId: number, index: number) {
    const evidence = await this.getOrCreateActivityEvidence(activityId);

    if (!evidence.evidencePhotos || evidence.evidencePhotos.length === 0) {
      throw new BadRequestException('No hay fotos de evidencia para remover');
    }

    if (index < 0 || index >= evidence.evidencePhotos.length) {
      throw new BadRequestException('Índice de foto inválido');
    }

    if (evidence.evidencePhotos.length <= 4) {
      throw new BadRequestException('Mínimo 4 fotos de evidencia son requeridas');
    }

    const updatedPhotos = evidence.evidencePhotos.filter((_, i) => i !== index);

    return this.prisma.activityEvidence.update({
      where: { activityId },
      data: {
        evidencePhotos: updatedPhotos,
      },
    });
  }
}
