import { Body, Controller, Get, Param, ParseIntPipe, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ServiceSheetsService } from './service-sheets.service.js';
import { UpsertServiceSheetDto } from './dto/upsert-service-sheet.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('service-sheets')
export class ServiceSheetsController {
  constructor(private readonly serviceSheetsService: ServiceSheetsService) {}

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  @Post(':activityId')
  upsert(@Param('activityId', ParseIntPipe) activityId: number, @Body() dto: UpsertServiceSheetDto) {
    return this.serviceSheetsService.upsert(activityId, dto);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  @Get(':activityId')
  findOne(@Param('activityId', ParseIntPipe) activityId: number) {
    return this.serviceSheetsService.findByActivity(activityId);
  }

  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  @Get(':activityId/pdf')
  async pdf(@Param('activityId', ParseIntPipe) activityId: number, @Res() res: Response) {
    const pdf = await this.serviceSheetsService.getPdf(activityId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=hoja-servicio-${activityId}.pdf`);
    res.send(pdf);
  }
}
