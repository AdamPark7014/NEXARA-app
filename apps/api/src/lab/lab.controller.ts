import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { LabService } from './lab.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('lab')
@UseGuards(RbacGuard)
export class LabController {
  constructor(private readonly svc: LabService) {}

  // ── Feature Flags ────────────────────────────────────────────────
  @Get('flags')
  @RBAC({ anyPermissions: [PERMISSIONS.LAB_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  listFlags(@Query('scope') scope?: string) {
    return this.svc.listFlags(scope);
  }

  @Patch('flags/:key')
  @RBAC({ anyPermissions: [PERMISSIONS.LAB_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  setFlag(@Param('key') key: string, @Body('enabled') enabled: boolean) {
    return this.svc.setFlag(key, Boolean(enabled));
  }

  @Post('flags')
  @RBAC({ anyPermissions: [PERMISSIONS.LAB_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  upsertFlag(@Body() dto: { key: string; scope: string; description?: string; enabled?: boolean; metadata?: any }) {
    return this.svc.upsertFlag(dto);
  }

  @Delete('flags/:key')
  @RBAC({ anyPermissions: [PERMISSIONS.LAB_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  deleteFlag(@Param('key') key: string) {
    return this.svc.deleteFlag(key);
  }

  // ── AI Sandbox ────────────────────────────────────────────────────
  @Post('ai')
  @RBAC({ anyPermissions: [PERMISSIONS.LAB_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  ai(@Body() dto: { model: string; prompt: string; systemPrompt?: string }) {
    return this.svc.runAiPrompt(dto);
  }

  // ── Health resumido ───────────────────────────────────────────────
  @Get('health-summary')
  @RBAC({ anyPermissions: [PERMISSIONS.LAB_ACCESS, PERMISSIONS.CONSOLE_ADMIN] })
  health() {
    return this.svc.getHealthSummary();
  }
}
