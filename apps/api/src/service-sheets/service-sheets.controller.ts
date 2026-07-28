import { Body, Controller, Get, Param, ParseIntPipe, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ServiceSheetsService } from './service-sheets.service.js';
import { UpsertServiceSheetDto } from './dto/upsert-service-sheet.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

@Controller('service-sheets')
export class ServiceSheetsController {
  constructor(private readonly serviceSheetsService: ServiceSheetsService) {}

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  @Get()
  findAll(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.serviceSheetsService.findAll(user, companyId);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  @Post(':activityId')
  upsert(
    @Param('activityId', ParseIntPipe) activityId: number,
    @Body() dto: UpsertServiceSheetDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.serviceSheetsService.upsert(activityId, dto, companyId);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  @Get(':activityId')
  findOne(
    @Param('activityId', ParseIntPipe) activityId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.serviceSheetsService.findByActivity(activityId, companyId);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  @Get(':activityId/pdf')
  async pdf(
    @Param('activityId', ParseIntPipe) activityId: number,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
  ) {
    const pdf = await this.serviceSheetsService.getPdf(activityId, companyId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=hoja-servicio-${activityId}.pdf`);
    res.send(pdf);
  }
}
