import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  BadRequestException,
  ForbiddenException,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ActivityEvidenceService } from './activity-evidence.service';
import { ActivityGeofenceService } from '../geofence/activity-geofence.service.js';
import { RBAC, RbacGuard } from '../../common/rbac.guard.js';
import { UrlAccessGuard } from '../../common/rbac/url-access.guard.js';
import { saveBase64Photo, saveBase64Pdf } from '../../common/file-upload.util';
import { materializarAdjuntosDeCorreccion } from './evidence-flow.helpers.js';
import { ActivityEvidenceFieldsService } from './activity-evidence-fields.service.js';
import { ActivityEvidenceZipService } from './activity-evidence-zip.service.js';
import { CurrentCompanyId } from '../../common/tenant/current-company.decorator.js';
import { CurrentUser } from '../../common/current-user.decorator.js';
import { PERMISSIONS } from '../../common/permissions.js';
import { Response } from 'express';

@Controller('activity-evidence')
@UseGuards(UrlAccessGuard, RbacGuard) // RBAC v2 + legacy en cascada
export class ActivityEvidenceController {
  constructor(
    private service: ActivityEvidenceService,
    private geofence: ActivityGeofenceService,
    private campos: ActivityEvidenceFieldsService,
    private zip: ActivityEvidenceZipService,
  ) {}

  @Get('history')
  async getOwnEvidenceHistory(@Req() req: any) {
    return this.service.getOwnEvidenceHistory(req.user?.id);
  }

  @Get('review-history')
  async getReviewEvidenceHistory(@Req() req: any) {
    return this.service.getReviewEvidenceHistory(req.user);
  }

  @Get('history/report')
  async getOwnEvidenceHistoryReport(
    @Req() req: any,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    const pdf = await this.service.generateOwnHistorySummaryReport(req.user?.id, from, to);
    const filename = `reporte-evidencias-${from || 'inicio'}-${to || 'hoy'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    return res.send(pdf);
  }

  @Get(':activityId/report')
  async getOwnTicketReport(
    @Param('activityId') activityId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const parsedId = parseInt(activityId, 10);
    if (!Number.isFinite(parsedId) || parsedId <= 0) {
      throw new BadRequestException('ID de actividad inválido');
    }

    const result = await this.service.generateOwnTicketReport(parsedId, req.user?.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=reporte-ticket-${parsedId}.pdf`);
    return res.send(result.pdf);
  }

  /**
   * «Descargar evidencia»: la actividad entera como carpeta comprimida.
   * Se manda por partes para no juntar todas las fotos en memoria.
   */
  @Get(':activityId/evidencia.zip')
  @RBAC({
    anyPermissions: [
      PERMISSIONS.EVIDENCES_VIEW,
      PERMISSIONS.EVIDENCES_REVIEW,
      PERMISSIONS.ACTIVITIES_MANAGE,
    ],
  })
  async descargarEvidencia(
    @Param('activityId') activityId: string,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
  ) {
    const parsedId = parseInt(activityId, 10);
    if (!Number.isFinite(parsedId) || parsedId <= 0) {
      throw new BadRequestException('ID de actividad inválido');
    }

    const { generador, nombreArchivo } = await this.zip.construir(parsedId, companyId);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${nombreArchivo.replace(/[^\x20-\x7e]/g, '_')}"; ` +
        `filename*=UTF-8''${encodeURIComponent(nombreArchivo)}`,
    );
    // Se arma sobre la marcha: no se puede anunciar el tamaño por adelantado.
    res.setHeader('Cache-Control', 'no-store');

    for await (const parte of generador) {
      if (!res.write(parte)) {
        await new Promise<void>((listo) => res.once('drain', listo));
      }
    }
    res.end();
  }

  /** Qué hay que documentar en esta actividad, con lo que ya se documentó de cada cosa. */
  @Get(':activityId/campos')
  async listarCampos(
    @Param('activityId') activityId: string,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.campos.listarCampos(parseInt(activityId, 10), companyId);
  }

  /** La foto de un campo en un momento. Volver a mandarla reemplaza la anterior. */
  @Post(':activityId/campos/:fieldId/foto')
  async guardarFotoDeCampo(
    @Param('activityId') activityId: string,
    @Param('fieldId') fieldId: string,
    @Body()
    body: {
      momento: string;
      photoUrl: string;
      latitude?: number;
      longitude?: number;
      capturedAt?: string | null;
    },
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    let fileUrl = body?.photoUrl;
    if (fileUrl && (fileUrl.startsWith('data:') || fileUrl.includes(';base64,'))) {
      fileUrl = saveBase64Photo(fileUrl, __dirname, 'activities');
    }

    return this.campos.guardarFoto({
      activityId: parseInt(activityId, 10),
      fieldId: parseInt(fieldId, 10),
      momento: body?.momento,
      photoUrl: fileUrl,
      latitude: body?.latitude,
      longitude: body?.longitude,
      capturedAt: body?.capturedAt ?? null,
      userId: req.user.id,
      companyId,
    });
  }

  /** Quitar la foto de un campo deja el hueco pendiente otra vez. */
  @Post(':activityId/campos/:fieldId/foto/quitar')
  async quitarFotoDeCampo(
    @Param('activityId') activityId: string,
    @Param('fieldId') fieldId: string,
    @Body() body: { momento: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.campos.borrarFoto({
      activityId: parseInt(activityId, 10),
      fieldId: parseInt(fieldId, 10),
      momento: body?.momento,
      companyId,
    });
  }

  @Get(':activityId')
  async getActivityEvidence(
    @Param('activityId') activityId: string,
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.getActivityEvidence(parseInt(activityId, 10), req.user, companyId);
  }

  @Post(':activityId/entry-photo')
  async saveEntryPhoto(
    @Param('activityId') activityId: string,
    @Body()
    body: {
      photoUrl: string;
      latitude: number;
      longitude: number;
      /** Por qué la empieza antes que otra de más prioridad (opcional, no bloquea). */
      justificacionOrden?: string | null;
      /** El teléfono marcó la ubicación como simulada; se guarda, no bloquea. */
      mockLocation?: boolean;
    },
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    // Check if photoUrl contains base64 data and convert it
    let fileUrl = body.photoUrl;
    if (body.photoUrl && (body.photoUrl.startsWith('data:') || body.photoUrl.includes(';base64,'))) {
      // It's base64 data, save it to disk
      fileUrl = saveBase64Photo(body.photoUrl, __dirname, 'activities');
    }

    return this.service.saveEntryPhoto(
      parseInt(activityId, 10),
      req.user.id,
      fileUrl,
      body.latitude,
      body.longitude,
      companyId,
      body.justificacionOrden ?? null,
      body.mockLocation ?? null,
    );
  }

  @Post(':activityId/evidence-photos')
  async saveEvidencePhotos(
    @Param('activityId') activityId: string,
    @Body()
    body: {
      photoUrls: string[];
      /** Ubicación donde se tomó cada foto (mismo orden que photoUrls). */
      photoGeo?: Array<{ latitude: number; longitude: number; capturedAt?: string } | null>;
    },
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    // Convert any base64 data URLs to file URLs
    const processedUrls = body.photoUrls.map((photoUrl) => {
      if (photoUrl && (photoUrl.startsWith('data:') || photoUrl.includes(';base64,'))) {
        return saveBase64Photo(photoUrl, __dirname, 'activities');
      }
      return photoUrl;
    });

    return this.service.saveEvidencePhotos(
      parseInt(activityId, 10),
      req.user.id,
      processedUrls,
      companyId,
      body.photoGeo,
    );
  }

  @Post(':activityId/service-sheet-pdf')
  async saveServiceSheetPdf(
    @Param('activityId') activityId: string,
    @Body() body: { pdfUrl: string },
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    let fileUrl = body.pdfUrl;
    // Detect base64 PDF data: data URI prefix OR raw base64 (longer than a URL would be)
    if (
      body.pdfUrl &&
      (body.pdfUrl.startsWith('data:') ||
        body.pdfUrl.includes(';base64,') ||
        (body.pdfUrl.length > 500 && !body.pdfUrl.startsWith('/') && !body.pdfUrl.startsWith('http')))
    ) {
      fileUrl = saveBase64Pdf(body.pdfUrl, __dirname, 'activities');
    }
    return this.service.saveServiceSheetPdf(
      parseInt(activityId, 10),
      req.user.id,
      fileUrl,
      companyId,
    );
  }

  @Post(':activityId/service-sheet-data')
  async completeServiceSheetForm(
    @Param('activityId') activityId: string,
    @Body() body: any,
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.completeServiceSheetForm(
      parseInt(activityId, 10),
      req.user.id,
      body,
      companyId,
    );
  }

  /** Geocerca de la actividad para quien la ejecuta: punto de inicio, recorrido y salidas de zona. */
  @Get(':activityId/geocerca')
  geocerca(@Param('activityId') activityId: string, @Req() req: any) {
    // `puntos` (el recorrido) solo va para dirección; las alertas, para todos.
    return this.geofence.estado(parseInt(activityId, 10), req.user.id, req.user);
  }

  /** Justificar una salida de zona con motivo y foto. */
  @Post(':activityId/geocerca/alertas/:alertId/justificacion')
  justificarSalidaDeZona(
    @Param('activityId') activityId: string,
    @Param('alertId') alertId: string,
    @Body() body: { motivo: string; fotoBase64?: string | null },
    @Req() req: any,
  ) {
    return this.geofence.justificar({
      activityId: parseInt(activityId, 10),
      alertId: parseInt(alertId, 10),
      userId: req.user.id,
      motivo: body?.motivo,
      fotoBase64: body?.fotoBase64 ?? null,
    });
  }

  @Post(':activityId/exit-photo')
  async saveExitPhoto(
    @Param('activityId') activityId: string,
    @Body()
    body: {
      photoUrl: string;
      latitude: number;
      longitude: number;
      /** El teléfono marcó la ubicación como simulada; se guarda, no bloquea. */
      mockLocation?: boolean;
    },
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    // Check if photoUrl contains base64 data and convert it
    let fileUrl = body.photoUrl;
    if (body.photoUrl && (body.photoUrl.startsWith('data:') || body.photoUrl.includes(';base64,'))) {
      // It's base64 data, save it to disk
      fileUrl = saveBase64Photo(body.photoUrl, __dirname, 'activities');
    }

    return this.service.saveExitPhoto(
      parseInt(activityId, 10),
      req.user.id,
      fileUrl,
      body.latitude,
      body.longitude,
      companyId,
      body.mockLocation ?? null,
    );
  }

  @Post(':activityId/evidence-photo/:index')
  async updateEvidencePhoto(
    @Param('activityId') activityId: string,
    @Param('index') index: string,
    @Body() body: { photoUrl: string },
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    // Check if photoUrl contains base64 data and convert it
    let fileUrl = body.photoUrl;
    if (body.photoUrl && (body.photoUrl.startsWith('data:') || body.photoUrl.includes(';base64,'))) {
      // It's base64 data, save it to disk
      fileUrl = saveBase64Photo(body.photoUrl, __dirname, 'activities');
    }

    return this.service.updateEvidencePhoto(
      parseInt(activityId, 10),
      req.user.id,
      parseInt(index, 10),
      fileUrl,
      companyId,
    );
  }

  @Post(':activityId/evidence-photo/:index/remove')
  async removeEvidencePhoto(
    @Param('activityId') activityId: string,
    @Param('index') index: string,
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.removeEvidencePhoto(
      parseInt(activityId, 10),
      req.user.id,
      parseInt(index, 10),
      companyId,
    );
  }

  @Post(':activityId/approve')
  @RBAC({ permissions: [PERMISSIONS.EVIDENCES_REVIEW] })
  async approveEvidence(
    @Param('activityId') activityId: string,
    @Body() body: { notes?: string; userId?: number },
    @Query('userId') evidenceUserId: string | undefined,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (!user?.id) {
      throw new ForbiddenException('Sesión inválida');
    }
    const targetUserId = Number(evidenceUserId ?? body.userId);
    if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
      throw new BadRequestException('userId de evidencia requerido');
    }
    return this.service.approveEvidence(
      parseInt(activityId, 10),
      targetUserId,
      user.id,
      body.notes,
      companyId,
    );
  }

  @Post(':activityId/reject')
  @RBAC({ permissions: [PERMISSIONS.EVIDENCES_REVIEW] })
  async rejectEvidence(
    @Param('activityId') activityId: string,
    @Body()
    body: {
      notes: string;
      userId?: number;
      rejectedStep?: string;
      rejectedSteps?: string[];
      resetFullFlow?: boolean;
    },
    @Query('userId') evidenceUserId: string | undefined,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (!user?.id) {
      throw new ForbiddenException('Sesión inválida');
    }
    const targetUserId = Number(evidenceUserId ?? body.userId);
    if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
      throw new BadRequestException('userId de evidencia requerido');
    }
    return this.service.rejectEvidence(
      parseInt(activityId, 10),
      targetUserId,
      user.id,
      body.notes,
      {
        rejectedStep: body.rejectedStep,
        rejectedSteps: body.rejectedSteps,
        resetFullFlow: body.resetFullFlow,
      },
      companyId,
    );
  }

  @Post(':activityId/resubmit')
  async resubmitStep(
    @Param('activityId') activityId: string,
    @Body() body: { step: string; data: any },
    @Req() req: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    // Corregir un paso manda la misma foto que el paso original: base64 desde la cámara.
    // Sin esta conversión el data URL entero iba a `exitPhotoUrl` (VARCHAR(500)) y la
    // foto de salida moría con un error de Postgres en vez de guardarse.
    return this.service.resubmitStep(
      parseInt(activityId, 10),
      req.user.id,
      body?.step,
      materializarAdjuntosDeCorreccion(body?.data, {
        foto: (base64) => saveBase64Photo(base64, __dirname, 'activities'),
        pdf: (base64) => saveBase64Pdf(base64, __dirname, 'activities'),
      }),
      companyId,
    );
  }
}
