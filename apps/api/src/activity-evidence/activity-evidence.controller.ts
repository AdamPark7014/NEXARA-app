import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ActivityEvidenceService } from './activity-evidence.service';
import { RbacGuard } from '../common/rbac.guard.js';

@Controller('activity-evidence')
@UseGuards(RbacGuard)
export class ActivityEvidenceController {
  constructor(private service: ActivityEvidenceService) {}

  @Get(':activityId')
  async getActivityEvidence(@Param('activityId') activityId: string) {
    return this.service.getActivityEvidence(parseInt(activityId, 10));
  }

  @Post(':activityId/entry-photo')
  async saveEntryPhoto(
    @Param('activityId') activityId: string,
    @Body() body: { photoUrl: string; latitude: number; longitude: number },
  ) {
    return this.service.saveEntryPhoto(
      parseInt(activityId, 10),
      body.photoUrl,
      body.latitude,
      body.longitude,
    );
  }

  @Post(':activityId/evidence-photos')
  async saveEvidencePhotos(
    @Param('activityId') activityId: string,
    @Body() body: { photoUrls: string[] },
  ) {
    return this.service.saveEvidencePhotos(parseInt(activityId, 10), body.photoUrls);
  }

  @Post(':activityId/service-sheet-pdf')
  async saveServiceSheetPdf(
    @Param('activityId') activityId: string,
    @Body() body: { pdfUrl: string },
  ) {
    return this.service.saveServiceSheetPdf(parseInt(activityId, 10), body.pdfUrl);
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
    return this.service.saveExitPhoto(
      parseInt(activityId, 10),
      body.photoUrl,
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
    return this.service.updateEvidencePhoto(
      parseInt(activityId, 10),
      parseInt(index, 10),
      body.photoUrl,
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
    @Body() body: { reviewerId: number; rejectedStep: string; notes: string },
  ) {
    return this.service.rejectEvidence(
      parseInt(activityId, 10),
      body.reviewerId,
      body.rejectedStep,
      body.notes,
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
