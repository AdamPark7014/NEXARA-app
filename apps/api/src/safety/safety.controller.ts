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
  @RBAC({ anyPermissions: [PERMISSIONS.SAFETY_VIEW, PERMISSIONS.CONSOLE_ADMIN] })
  createIncident(@Body() dto: any, @CurrentUser() user: any) {
    return this.svc.createIncident(dto, user.id);
  }

  @Get('incidents')
  @RBAC({ anyPermissions: [PERMISSIONS.SAFETY_VIEW, PERMISSIONS.CONSOLE_ADMIN] })
  listIncidents(@Query('status') status?: string, @Query('severity') severity?: string) {
    return this.svc.listIncidents({ status, severity });
  }

  @Get('incidents/:id')
  @RBAC({ anyPermissions: [PERMISSIONS.SAFETY_VIEW, PERMISSIONS.CONSOLE_ADMIN] })
  getIncident(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getIncident(id);
  }

  @Patch('incidents/:id')
  @RBAC({ anyPermissions: [PERMISSIONS.SAFETY_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  updateIncident(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.updateIncident(id, dto);
  }

  // Work Permits
  @Post('permits')
  @RBAC({ anyPermissions: [PERMISSIONS.SAFETY_PERMITS, PERMISSIONS.CONSOLE_ADMIN] })
  createPermit(@Body() dto: any, @CurrentUser() user: any) {
    return this.svc.createWorkPermit(dto, user.id);
  }

  @Get('permits')
  @RBAC({ anyPermissions: [PERMISSIONS.SAFETY_VIEW, PERMISSIONS.CONSOLE_ADMIN] })
  listPermits(@Query('status') status?: string, @Query('type') type?: string) {
    return this.svc.listWorkPermits({ status, type });
  }

  @Patch('permits/:id/approve')
  @RBAC({ anyPermissions: [PERMISSIONS.SAFETY_PERMITS, PERMISSIONS.CONSOLE_ADMIN] })
  approvePermit(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.approveWorkPermit(id, user.id);
  }

  // Training
  @Post('training')
  @RBAC({ anyPermissions: [PERMISSIONS.SAFETY_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  createTraining(@Body() dto: any) {
    return this.svc.createTrainingRecord(dto);
  }

  @Get('training')
  @RBAC({ anyPermissions: [PERMISSIONS.SAFETY_VIEW, PERMISSIONS.CONSOLE_ADMIN] })
  listTraining(@Query('userId') userId?: string) {
    return this.svc.listTrainingRecords(userId ? +userId : undefined);
  }

  @Get('training/expired')
  @RBAC({ anyPermissions: [PERMISSIONS.SAFETY_VIEW, PERMISSIONS.CONSOLE_ADMIN] })
  expiredTraining() {
    return this.svc.getExpiredTrainings();
  }
}
