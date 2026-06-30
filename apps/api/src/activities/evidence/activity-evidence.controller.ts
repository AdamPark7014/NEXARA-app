import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  BadRequestException,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ActivityEvidenceService } from './activity-evidence.service';
import { RbacGuard } from '../../common/rbac.guard.js';
import { UrlAccessGuard } from '../../common/rbac/url-access.guard.js';
import { saveBase64Photo, saveBase64Pdf } from '../../common/file-upload.util';
import { Response } from 'express';

@Controller('activity-evidence')
@UseGuards(UrlAccessGuard, RbacGuard) // RBAC v2 + legacy en cascada
export class ActivityEvidenceController {
  constructor(private service: ActivityEvidenceService) {}

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

  @Get(':activityId')
  async getActivityEvidence(@Param('activityId') activityId: string, @Req() req: any) {
    return this.service.getActivityEvidence(parseInt(activityId, 10), req.user);
  }

  @Post(':activityId/entry-photo')
  async saveEntryPhoto(
    @Param('activityId') activityId: string,
    @Body() body: { photoUrl: string; latitude: number; longitude: number },
  ) {
    // Check if photoUrl contains base64 data and convert it
    let fileUrl = body.photoUrl;
    if (body.photoUrl && (body.photoUrl.startsWith('data:') || body.photoUrl.includes(';base64,'))) {
      // It's base64 data, save it to disk
      fileUrl = saveBase64Photo(body.photoUrl, __dirname, 'activities');
    }

    return this.service.saveEntryPhoto(
      parseInt(activityId, 10),
      fileUrl,
      body.latitude,
      body.longitude,
    );
  }

  @Post(':activityId/evidence-photos')
  async saveEvidencePhotos(
    @Param('activityId') activityId: string,
    @Body() body: { photoUrls: string[] },
  ) {
    // Convert any base64 data URLs to file URLs
    const processedUrls = body.photoUrls.map((photoUrl) => {
      if (photoUrl && (photoUrl.startsWith('data:') || photoUrl.includes(';base64,'))) {
        return saveBase64Photo(photoUrl, __dirname, 'activities');
      }
      return photoUrl;
    });

    return this.service.saveEvidencePhotos(parseInt(activityId, 10), processedUrls);
  }

  @Post(':activityId/service-sheet-pdf')
  async saveServiceSheetPdf(
    @Param('activityId') activityId: string,
    @Body() body: { pdfUrl: string },
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
    return this.service.saveServiceSheetPdf(parseInt(activityId, 10), fileUrl);
  }

  @Post(':activityId/service-sheet-data')
  async completeServiceSheetForm(
    @Param('activityId') activityId: string,
    @Body() body: any,
  ) {
    return this.service.completeServiceSheetForm(parseInt(activityId, 10), body);
  }

  @Post(':activityId/exit-photo')
  async saveExitPhoto(
    @Param('activityId') activityId: string,
    @Body() body: { photoUrl: string; latitude: number; longitude: number },
  ) {
    // Check if photoUrl contains base64 data and convert it
    let fileUrl = body.photoUrl;
    if (body.photoUrl && (body.photoUrl.startsWith('data:') || body.photoUrl.includes(';base64,'))) {
      // It's base64 data, save it to disk
      fileUrl = saveBase64Photo(body.photoUrl, __dirname, 'activities');
    }

    return this.service.saveExitPhoto(
      parseInt(activityId, 10),
      fileUrl,
      body.latitude,
      body.longitude,
    );
  }

  @Post(':activityId/evidence-photo/:index')
  async updateEvidencePhoto(
    @Param('activityId') activityId: string,
    @Param('index') index: string,
    @Body() body: { photoUrl: string },
  ) {
    // Check if photoUrl contains base64 data and convert it
    let fileUrl = body.photoUrl;
    if (body.photoUrl && (body.photoUrl.startsWith('data:') || body.photoUrl.includes(';base64,'))) {
      // It's base64 data, save it to disk
      fileUrl = saveBase64Photo(body.photoUrl, __dirname, 'activities');
    }

    return this.service.updateEvidencePhoto(
      parseInt(activityId, 10),
      parseInt(index, 10),
      fileUrl,
    );
  }

  @Post(':activityId/evidence-photo/:index/remove')
  async removeEvidencePhoto(
    @Param('activityId') activityId: string,
    @Param('index') index: string,
  ) {
    return this.service.removeEvidencePhoto(parseInt(activityId, 10), parseInt(index, 10));
  }

  @Post(':activityId/approve')
  async approveEvidence(
    @Param('activityId') activityId: string,
    @Body() body: { reviewerId: number; notes?: string },
  ) {
    return this.service.approveEvidence(
      parseInt(activityId, 10),
      body.reviewerId,
      body.notes,
    );
  }

  @Post(':activityId/reject')
  async rejectEvidence(
    @Param('activityId') activityId: string,
    @Body()
    body: {
      reviewerId: number;
      notes: string;
      rejectedStep?: string;
      rejectedSteps?: string[];
      resetFullFlow?: boolean;
    },
  ) {
    return this.service.rejectEvidence(
      parseInt(activityId, 10),
      body.reviewerId,
      body.notes,
      {
        rejectedStep: body.rejectedStep,
        rejectedSteps: body.rejectedSteps,
        resetFullFlow: body.resetFullFlow,
      },
    );
  }

  @Post(':activityId/resubmit')
  async resubmitStep(
    @Param('activityId') activityId: string,
    @Body() body: { step: string; data: any },
  ) {
    return this.service.resubmitStep(parseInt(activityId, 10), body.step, body.data);
  }
}
