import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { SafetyService } from './safety.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('safety')
@UseGuards(RbacGuard)
export class SafetyController {
  constructor(private readonly svc: SafetyService) {}

  // Incidents
  @Post('incidents')
  @RBAC({ permissions: [PERMISSIONS.SAFETY_VIEW] })
  createIncident(@Body() dto: any, @CurrentUser() user: any) {
    return this.svc.createIncident(dto, user.id);
  }

  @Get('incidents')
  @RBAC({ permissions: [PERMISSIONS.SAFETY_VIEW] })
  listIncidents(@Query('status') status?: string, @Query('severity') severity?: string) {
    return this.svc.listIncidents({ status, severity });
  }

  @Get('incidents/:id')
  @RBAC({ permissions: [PERMISSIONS.SAFETY_VIEW] })
  getIncident(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getIncident(id);
  }

  @Patch('incidents/:id')
  @RBAC({ permissions: [PERMISSIONS.SAFETY_MANAGE] })
  updateIncident(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.updateIncident(id, dto);
  }

  // Work Permits
  @Post('permits')
  @RBAC({ permissions: [PERMISSIONS.SAFETY_PERMITS] })
  createPermit(@Body() dto: any, @CurrentUser() user: any) {
    return this.svc.createWorkPermit(dto, user.id);
  }

  @Get('permits')
  @RBAC({ permissions: [PERMISSIONS.SAFETY_VIEW] })
  listPermits(@Query('status') status?: string, @Query('type') type?: string) {
    return this.svc.listWorkPermits({ status, type });
  }

  @Patch('permits/:id/approve')
  @RBAC({ permissions: [PERMISSIONS.SAFETY_PERMITS] })
  approvePermit(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.approveWorkPermit(id, user.id);
  }

  // Training
  @Post('training')
  @RBAC({ permissions: [PERMISSIONS.SAFETY_MANAGE] })
  createTraining(@Body() dto: any) {
    return this.svc.createTrainingRecord(dto);
  }

  @Get('training')
  @RBAC({ permissions: [PERMISSIONS.SAFETY_VIEW] })
  listTraining(@Query('userId') userId?: string) {
    return this.svc.listTrainingRecords(userId ? +userId : undefined);
  }

  @Get('training/expired')
  @RBAC({ permissions: [PERMISSIONS.SAFETY_VIEW] })
  expiredTraining() {
    return this.svc.getExpiredTrainings();
  }
}
