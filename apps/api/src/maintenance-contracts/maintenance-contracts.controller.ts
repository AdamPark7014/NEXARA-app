import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { MaintenanceContractsService } from './maintenance-contracts.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { generateContractPdf } from './maintenance-contract-pdf.js';

const MAINT_VIEW = [PERMISSIONS.MAINTENANCE_VIEW, PERMISSIONS.MAINTENANCE_MANAGE, PERMISSIONS.CONSOLE_ADMIN];
const MAINT_MANAGE = [PERMISSIONS.MAINTENANCE_MANAGE, PERMISSIONS.CONSOLE_ADMIN];

@Controller('maintenance-contracts')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class MaintenanceContractsController {
  constructor(private readonly service: MaintenanceContractsService) {}

  @Post()
  @RBAC({ anyPermissions: MAINT_MANAGE })
  create(@Body() dto: any, @CurrentCompanyId() companyId: number | null) {
    return this.service.createContract({ ...dto, companyId });
  }

  @Get()
  @RBAC({ anyPermissions: MAINT_VIEW })
  list(
    @CurrentCompanyId() companyId: number | null,
    @Query('status') status?: string,
    @Query('clientId') clientId?: string,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.service.listContracts({
      status,
      clientId: clientId ? +clientId : undefined,
      ownerId: ownerId ? +ownerId : undefined,
      companyId,
    });
  }

  @Get('visits')
  @RBAC({ anyPermissions: MAINT_VIEW })
  visits(
    @CurrentCompanyId() companyId: number | null,
    @Query('contractId') contractId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listVisits({
      contractId: contractId ? +contractId : undefined,
      status,
      from,
      to,
      companyId,
    });
  }

  @Post('visits/:id/generate-ot')
  @RBAC({ anyPermissions: MAINT_MANAGE })
  generateOt(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { assignedToId?: number },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.materializeVisitAsActivity(id, body, companyId);
  }

  @Post('visits/:id/complete')
  @RBAC({ anyPermissions: MAINT_MANAGE })
  completeVisit(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.markVisitCompleted(id, companyId);
  }

  @Get(':id')
  @RBAC({ anyPermissions: MAINT_VIEW })
  get(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.service.getContract(id, companyId);
  }

  @Patch(':id')
  @RBAC({ anyPermissions: MAINT_MANAGE })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.updateContract(id, dto, companyId);
  }

  @Patch(':id/status')
  @RBAC({ anyPermissions: MAINT_MANAGE })
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: any },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.setStatus(id, body.status, companyId);
  }

  @Post('run-cron')
  @RBAC({ anyPermissions: MAINT_MANAGE })
  runCron() {
    return this.service.runAutoGenerationCycle();
  }

  @Get(':id/pdf')
  @RBAC({ anyPermissions: MAINT_VIEW })
  async pdf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
  ) {
    const contract = await this.service.getContract(id, companyId);
    if (!contract) {
      res.status(404).send('Contrato no encontrado');
      return;
    }
    const visits = await this.service.listVisits({ contractId: id, companyId });
    const buffer = await generateContractPdf({
      contractNumber: contract.contractNumber,
      title: contract.title,
      startDate: contract.startDate.toISOString(),
      endDate: contract.endDate?.toISOString() || null,
      frequencyMonths: contract.frequencyMonths,
      status: contract.status,
      clientName: contract.client?.name,
      clientRfc: (contract.client as any)?.rfc || null,
      clientAddress: (contract.client as any)?.address || null,
      monthlyAmount: Number(contract.monthlyAmount || 0),
      scope: contract.scope,
      slaResponseHours: contract.slaResponseHours,
      slaResolutionHours: contract.slaResolutionHours,
      visits: visits.map((v: any) => ({
        scheduledDate: v.scheduledDate.toISOString(),
        description: v.description,
        status: v.status,
      })),
      companyName: process.env.COMPANY_TRADE_NAME || 'NEXARA Tech',
      companyRfc: process.env.COMPANY_RFC || '',
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="contrato-${contract.contractNumber}.pdf"`);
    res.send(buffer);
  }
}
